import * as constants from "constants" with { type: "json" };
import { createClient } from "@supabase/supabase-js";
import { authorizeSystemCron } from "../_shared/auth.ts";
import {
  buildDockerControlServerUrl,
  getDockerControlToken,
} from "../_shared/docker-control.ts";
import {
  fetchSnapshotFromStorage,
  isSnapshotFresh,
} from "../_shared/teamspeak.ts";
import type { Database, Json, Tables } from "database-types";
import { COUNTRIES } from "../../../app/lib/utils/country.ts";
import type { MetricsServerDetail, MetricsSnapshot } from "metrics-types";

// ---------------------------------------------------------------------------
// Country normalization (unchanged from previous implementation)
// ---------------------------------------------------------------------------

interface CountryRow {
  country: Tables<"profiles">["country"];
}

const VALID_COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));
const UNKNOWN_COUNTRY_KEY = "unknown";

function normalizeCountryCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  return VALID_COUNTRY_CODES.has(normalized) ? normalized : null;
}

// ---------------------------------------------------------------------------
// Local row shapes
// ---------------------------------------------------------------------------

type GameRow = Pick<Tables<"games">, "id" | "steam_id">;

type GameserverRow = Pick<
  Tables<"gameservers">,
  | "id"
  | "name"
  | "query_protocol"
  | "query_port"
  | "port"
  | "addresses"
  | "container"
>;

// presences_steam row with embedded profile
interface SteamPresenceRow {
  current_app_id: number | null;
  status: string | null;
  profile: { rich_presence_enabled: boolean } | null;
}

// Container row with embedded server
interface ContainerWithServerRow {
  name: string;
  server: Tables<"servers"> | null;
}

// Docker-control query endpoint response
interface DockerQueryResult {
  success: boolean;
  playerCount: number;
  maxPlayers: number;
  world: string;
  // Minecraft-specific
  players?: string[];
  motd?: string;
  gameType?: string;
  gameId?: string;
  version?: string;
  plugins?: string;
  hostPort?: number;
  hostIp?: string;
  extra?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  try {
    const authorizeResponse = authorizeSystemCron(req);
    if (authorizeResponse) {
      console.error("Authorization failed:", authorizeResponse.statusText);
      return authorizeResponse;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SECRET_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      "";

    if (!supabaseUrl) {
      throw new Error("SUPABASE_URL environment variable is not set");
    }
    if (!supabaseKey) {
      throw new Error(
        "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY environment variable is not set",
      );
    }

    const DOCKER_CONTROL_TOKEN = getDockerControlToken();

    const supabaseClient = createClient<Database>(supabaseUrl, supabaseKey);

    const onlineThreshold = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // Round 1: all independent DB + storage queries in parallel
    const [
      totalMembersRes,
      onlineMembersRes,
      countryRes,
      projectsRes,
      forumRes,
      repliesRes,
      newForumRes,
      newRepliesRes,
      gamesRes,
      presencesRes,
      gameserversRes,
      tsSnapshot,
    ] = await Promise.all([
      supabaseClient.from("profiles").select("id", {
        count: "exact",
        head: true,
      }),
      supabaseClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gt("last_seen", onlineThreshold),
      supabaseClient.from("profiles").select("country"),
      supabaseClient.from("projects").select("id", {
        count: "exact",
        head: true,
      }),
      supabaseClient
        .from("discussions")
        .select("id", { count: "exact", head: true })
        .not("discussion_topic_id", "is", null),
      supabaseClient
        .from("discussion_replies")
        .select("id", { count: "exact", head: true })
        .not("discussion_id", "is", null),
      supabaseClient
        .from("discussions")
        .select("id", { count: "exact", head: true })
        .not("discussion_topic_id", "is", null)
        .gte("created_at", onlineThreshold),
      supabaseClient
        .from("discussion_replies")
        .select("id", { count: "exact", head: true })
        .gte("created_at", onlineThreshold),
      supabaseClient.from("games").select("id, steam_id").not(
        "steam_id",
        "is",
        null,
      ),
      supabaseClient
        .from("presences_steam")
        .select(
          "current_app_id, profile:profiles!presences_steam_profile_id_fkey(rich_presence_enabled)",
        )
        .neq("status", "offline")
        .not("current_app_id", "is", null),
      supabaseClient
        .from("gameservers")
        .select(
          "id, name, query_protocol, query_port, port, addresses, container",
        )
        .not("container", "is", null),
      fetchSnapshotFromStorage(supabaseClient),
    ]);

    // Validate required query results
    if (totalMembersRes.error) {
      throw new Error(
        `Unable to get member count: ${totalMembersRes.error.message}`,
      );
    }
    if (onlineMembersRes.error) {
      throw new Error(
        `Unable to get online member count: ${onlineMembersRes.error.message}`,
      );
    }
    if (countryRes.error) {
      throw new Error(
        `Unable to get country data: ${countryRes.error.message}`,
      );
    }
    if (projectsRes.error) {
      throw new Error(
        `Unable to get project count: ${projectsRes.error.message}`,
      );
    }
    if (forumRes.error) {
      throw new Error(
        `Unable to get forum post count: ${forumRes.error.message}`,
      );
    }
    if (repliesRes.error) {
      throw new Error(
        `Unable to get discussion reply count: ${repliesRes.error.message}`,
      );
    }
    if (newForumRes.error) {
      throw new Error(
        `Unable to get new discussion count: ${newForumRes.error.message}`,
      );
    }
    if (newRepliesRes.error) {
      throw new Error(
        `Unable to get new reply count: ${newRepliesRes.error.message}`,
      );
    }
    if (gamesRes.error) {
      throw new Error(`Unable to get games: ${gamesRes.error.message}`);
    }
    if (presencesRes.error) {
      throw new Error(
        `Unable to get Steam presences: ${presencesRes.error.message}`,
      );
    }
    if (gameserversRes.error) {
      throw new Error(
        `Unable to get gameservers: ${gameserversRes.error.message}`,
      );
    }

    // ---------------------------------------------------------------------------
    // Members - byCountry
    // ---------------------------------------------------------------------------

    const countryCounts = (countryRes.data as CountryRow[] | null)?.reduce(
      (acc, row) => {
        const code = normalizeCountryCode(row.country) ?? UNKNOWN_COUNTRY_KEY;
        acc[code] = (acc[code] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ) ?? {};

    const byCountry = Object.fromEntries(
      Object.entries(countryCounts).sort(([, a], [, b]) => b - a),
    );

    // ---------------------------------------------------------------------------
    // Members - byGame
    // ---------------------------------------------------------------------------

    // Build steam_id -> game.id map (only for games with a known steam_id)
    const steamIdToGameId = new Map<number, number>();
    for (const g of (gamesRes.data as GameRow[] | null) ?? []) {
      if (g.steam_id != null) steamIdToGameId.set(g.steam_id, g.id);
    }

    const byGame: Record<string, number> = {};
    for (const row of (presencesRes.data as SteamPresenceRow[] | null) ?? []) {
      if (!row.profile?.rich_presence_enabled) continue;
      if (row.current_app_id == null) continue;
      const gameId = steamIdToGameId.get(row.current_app_id);
      if (gameId == null) continue; // not a tracked game
      const key = String(gameId);
      byGame[key] = (byGame[key] ?? 0) + 1;
    }

    // ---------------------------------------------------------------------------
    // TeamSpeak
    // ---------------------------------------------------------------------------

    const tsServers = isSnapshotFresh(tsSnapshot, 20 * 60 * 1000)
      ? (tsSnapshot?.servers ?? [])
      : [];

    const tsByServer: Record<string, number> = {};
    for (const s of tsServers) {
      tsByServer[s.id] = s.serverInfo?.totalClients ?? 0;
    }

    const tsOnline = tsServers.reduce(
      (sum, s) => sum + (s.serverInfo?.totalClients ?? 0),
      0,
    );

    // ---------------------------------------------------------------------------
    // Gameservers - docker-control queries
    // ---------------------------------------------------------------------------

    const gameservers = (gameserversRes.data ?? []) as GameserverRow[];
    const totalGameservers = gameservers.length;

    // Find gameservers that support querying
    const queryableGameservers = gameservers.filter(
      (gs) => gs.query_protocol != null && gs.container != null,
    );

    // Round 2: batch-fetch container+server records for all queryable gameservers
    const containerNames = queryableGameservers.map((gs) => gs.container!);

    const containerServerMap = new Map<string, Tables<"servers">>();

    if (containerNames.length > 0) {
      const { data: containerRows, error: containersError } =
        await supabaseClient
          .from("containers")
          .select("name, server(*)")
          .in("name", containerNames);

      if (containersError) {
        console.error(
          "Failed to fetch container server mappings:",
          containersError.message,
        );
      } else {
        for (
          const row of (containerRows as ContainerWithServerRow[] | null) ?? []
        ) {
          if (row.server) containerServerMap.set(row.name, row.server);
        }
      }
    }

    // Round 3: query each game server in parallel via docker-control
    const byServer: Record<string, MetricsServerDetail> = {};

    // Initialise all gameservers with null detail so every entry is present
    for (const gs of gameservers) {
      byServer[String(gs.id)] = gs.query_protocol
        ? {
          protocol: gs.query_protocol,
          data: { players: null, maxPlayers: null, world: null },
        }
        : { protocol: null, data: null };
    }

    if (queryableGameservers.length > 0) {
      const queryResults = await Promise.allSettled(
        queryableGameservers.map(async (gs) => {
          const nullDetail = {
            id: gs.id,
            detail: {
              protocol: gs.query_protocol!,
              data: { players: null, maxPlayers: null, world: null },
            } as MetricsServerDetail,
          };

          const server = containerServerMap.get(gs.container!);
          if (!server) {
            console.warn(
              `No server found for container "${gs.container}" (gameserver ${gs.id})`,
            );
            return nullDetail;
          }

          const port = gs.query_port?.toString() ?? gs.port ?? undefined;
          const baseUrl = buildDockerControlServerUrl(
            server,
            `query/name/${gs.container!}`,
          );
          const params = new URLSearchParams({ protocol: gs.query_protocol! });
          if (port != null) params.set("port", port);
          const url = `${baseUrl}?${params.toString()}`;

          try {
            const res = await fetch(url, {
              method: "GET",
              headers: { Authorization: `Bearer ${DOCKER_CONTROL_TOKEN}` },
              signal: AbortSignal.timeout(5000),
            });

            if (!res.ok) {
              console.warn(
                `Query failed for gameserver ${gs.id} (${gs.name}): HTTP ${res.status}`,
              );
              return nullDetail;
            }

            const body = await res.json() as DockerQueryResult;
            if (!body.success) {
              return nullDetail;
            }

            const protocol = gs.query_protocol!;
            const detail: MetricsServerDetail = protocol === "minecraft"
              ? {
                protocol,
                data: {
                  players: body.playerCount,
                  maxPlayers: body.maxPlayers,
                  world: body.world,
                  playerList: body.players ?? null,
                  motd: body.motd ?? null,
                  gameType: body.gameType ?? null,
                  gameId: body.gameId ?? null,
                  version: body.version ?? null,
                  plugins: body.plugins ?? null,
                  hostPort: body.hostPort ?? null,
                  hostIp: body.hostIp ?? null,
                  extra: body.extra ?? null,
                },
              }
              : {
                protocol,
                data: {
                  players: body.playerCount,
                  maxPlayers: body.maxPlayers,
                  world: body.world,
                },
              };

            return { id: gs.id, detail };
          } catch (err) {
            const error = err as Error;
            console.warn(
              `Query error for gameserver ${gs.id} (${gs.name}):`,
              error.message,
            );
            return nullDetail;
          }
        }),
      );

      for (const result of queryResults) {
        if (result.status === "fulfilled") {
          byServer[String(result.value.id)] = result.value.detail;
        }
      }
    }

    const totalPlayers = Object.values(byServer).reduce(
      (sum, d) => sum + (d.data?.players ?? 0),
      0,
    );

    // ---------------------------------------------------------------------------
    // Build payload
    // ---------------------------------------------------------------------------

    const now = new Date();

    const payload: MetricsSnapshot = {
      collectedAt: now.toISOString(),
      members: {
        total: totalMembersRes.count ?? 0,
        online: onlineMembersRes.count ?? 0,
        byCountry,
        byGame,
      },
      community: {
        projects: projectsRes.count ?? 0,
      },
      discussions: {
        total: forumRes.count ?? 0,
        replies: repliesRes.count ?? 0,
        newTotal: newForumRes.count ?? 0,
        newReplies: newRepliesRes.count ?? 0,
      },
      teamspeak: {
        online: tsOnline,
        byServer: tsByServer,
      },
      gameservers: {
        total: totalGameservers,
        players: totalPlayers,
        byServer,
      },
    };

    // ---------------------------------------------------------------------------
    // Persist: INSERT into metrics table
    // ---------------------------------------------------------------------------

    const { error: insertError } = await supabaseClient
      .from("metrics")
      .insert({
        captured_at: now.toISOString(),
        data: payload as unknown as Json,
      });

    if (insertError) {
      throw new Error(`Failed to insert metrics row: ${insertError.message}`);
    }

    // ---------------------------------------------------------------------------
    // Persist: upload latest snapshot to storage
    // ---------------------------------------------------------------------------

    const { error: uploadError } = await supabaseClient.storage
      .from("hivecom-content-static")
      .upload(
        "metrics/latest.json",
        new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        }),
        {
          upsert: true,
          cacheControl: "1800",
          contentType: "application/json",
        },
      );

    if (uploadError) {
      throw new Error(
        `Failed to upload metrics snapshot: ${uploadError.message}`,
      );
    }

    console.log("Collected and stored metrics snapshot:", payload.collectedAt);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Collected application metrics successfully",
        metrics: payload,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const error = err as Error;
    console.error("Error in cron-metrics-fetch:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: constants.default.API_ERROR,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
