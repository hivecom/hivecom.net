import * as constants from "app-constants" with { type: "json" };
import { createClient } from "@supabase/supabase-js";
import { TeamSpeakClient } from "node-ts/lib/node-ts.js";
import { authorizeSystemCron } from "../_shared/auth.ts";
import { parseEnvMap } from "../_shared/env.ts";
import type { Database, Tables } from "database-types";

interface TeamSpeakServerDefinition {
  id: string;
  title?: string;
  queryHost: string;
  queryPort?: number;
  voicePort?: number;
  virtualServerId?: number;
  botNickname?: string;
  roleAdminGroupId?: number;
  roleModeratorGroupId?: number;
  roleSupporterGroupId?: number;
  roleLifetimeSupporterGroupId?: number;
  roleRegisteredGroupId?: number;
}

interface CredentialsMap {
  usernames: Map<string, string>;
  passwords: Map<string, string>;
}

interface TeamSpeakClientEntry {
  clid?: number | string;
  client_unique_identifier?: string;
  client_nickname?: string;
  client_database_id?: number | string;
  cid?: number | string;
  client_type?: number | string;
  client_servergroups?: string;
  client_away?: string;
  client_input_muted?: string;
  client_output_muted?: string;
  client_talk_power?: string;
  client_talk_request?: string;
  client_idle_time?: string;
}

interface ServerSnapshot {
  id: string;
  title?: string;
  address: string;
  collectedAt: string;
  channels: unknown[];
  clients: Array<{
    uniqueId: string;
    nickname: string;
    channelId: string | null;
    serverGroups: number[];
    away: boolean;
    muted: boolean;
  }>;
}

const appConstants = constants.default;
const teamSpeakPlatform = appConstants?.PLATFORMS?.TEAMSPEAK ?? {} as { servers?: TeamSpeakServerDefinition[] };
const availableServers = Array.isArray(teamSpeakPlatform.servers)
  ? teamSpeakPlatform.servers as TeamSpeakServerDefinition[]
  : [];

const credentials: CredentialsMap = {
  usernames: parseEnvMap(Deno.env.get("TEAMSPEAK_QUERY_USERNAMES")),
  passwords: parseEnvMap(Deno.env.get("TEAMSPEAK_QUERY_PASSWORDS")),
};

const TEAMSPEAK_TIMEOUT_MS = 15_000;
const BUCKET = "hivecom-content-static";
const SNAPSHOT_PATH = "teamspeak/state.json";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseKey =
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL environment variable is not set");
}

if (!supabaseKey) {
  throw new Error("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY environment variable is not set");
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const authResponse = authorizeSystemCron(req);
  if (authResponse) return authResponse;

  try {
    if (!availableServers.length) {
      throw new Error("No TeamSpeak servers configured");
    }

    const profileMap = await loadProfileMap();
    const roleMap = await loadRoleMap();

    const snapshots: ServerSnapshot[] = [];

    for (const server of availableServers) {
      const snapshot = await processServer({ server, profileMap, roleMap });
      snapshots.push(snapshot);
    }

    const payload = {
      collectedAt: new Date().toISOString(),
      servers: snapshots,
    };

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(
        SNAPSHOT_PATH,
        new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
        { upsert: true, cacheControl: "300", contentType: "application/json" },
      );

    if (uploadError) {
      throw new Error(`Failed to upload TeamSpeak snapshot: ${uploadError.message}`);
    }

    return jsonResponse(200, { success: true, path: SNAPSHOT_PATH });
  } catch (error) {
    console.error("Error in cron-teamspeak-fetch", error);
    return jsonResponse(500, { success: false, error: "Failed to fetch TeamSpeak state" });
  }
});

async function processServer(args: {
  server: TeamSpeakServerDefinition;
  profileMap: Map<string, Tables<"profiles">>;
  roleMap: Map<string, Tables<"user_roles">["role"]>;
}): Promise<ServerSnapshot> {
  const { server, profileMap, roleMap } = args;
  const username = credentials.usernames.get(server.id);
  const password = credentials.passwords.get(server.id);

  if (!username || !password) {
    throw new Error(`Missing TeamSpeak credentials for server "${server.id}"`);
  }

  const client = new TeamSpeakClient(server.queryHost, server.queryPort ?? 10011);
  const collectedAt = new Date().toISOString();
  const address = buildServerAddress(server);

  try {
    await client.connect();
    client.setTimeout(TEAMSPEAK_TIMEOUT_MS);

    await client.send("login", {
      client_login_name: username,
      client_login_password: password,
    });

    if (typeof server.virtualServerId === "number") {
      await client.send("use", { sid: server.virtualServerId });
    } else if (typeof server.voicePort === "number") {
      await sendRawCommand(client, "use", { port: server.voicePort });
    } else {
      throw new Error(`Server "${server.id}" is missing routing information`);
    }

    if (server.botNickname) {
      await sendRawCommand(client, "clientupdate", {
        client_nickname: buildUniqueNickname(server.botNickname),
      });
    }

    const channels = await sendRawCommand(client, "channellist") as unknown[];
    const clientList = await sendRawCommand(client, "clientlist", {}, ["-uid", "-voice", "-away", "-groups"]) as {
      response?: TeamSpeakClientEntry[];
    };

    const onlineClients = (clientList.response ?? []).filter((c) =>
      String(c.client_type ?? "0") === "0" && c.client_unique_identifier
    );

    const normalizedClients: ServerSnapshot["clients"] = [];

    for (const entry of onlineClients) {
      const uniqueId = entry.client_unique_identifier as string;
      const nickname = entry.client_nickname ?? "Unknown";
      const channelId = entry.cid ? String(entry.cid) : null;
      const serverGroups = (entry.client_servergroups ?? "")
        .split(",")
        .map((g) => Number(g))
        .filter((n) => Number.isFinite(n));
      const away = entry.client_away === "1";
      const muted = entry.client_input_muted === "1" || entry.client_output_muted === "1";

      normalizedClients.push({
        uniqueId,
        nickname,
        channelId,
        serverGroups,
        away,
        muted,
      });

      const profile = profileMap.get(`${server.id}:${uniqueId}`);
      if (profile && !profile.banned) {
        const role = roleMap.get(profile.id) ?? null;

        if (!profile.rich_presence_disabled) {
          await upsertPresenceRow({
            profileId: profile.id,
            serverId: server.id,
            channelId,
            channelName: channelsFindName(channels, channelId),
            channelPath: channelsFindPath(channels, channelId),
          });
        }

        await ensureServerGroups({
          client,
          server,
          uniqueId,
          profile,
          role,
        });
      }
    }

    return {
      id: server.id,
      title: server.title,
      address,
      collectedAt,
      channels,
      clients: normalizedClients,
    };
  } finally {
    await shutdownClient(client);
  }
}

async function upsertPresenceRow(args: {
  profileId: string;
  serverId: string;
  channelId: string | null;
  channelName: string | null;
  channelPath: string[] | null;
}): Promise<void> {
  const { profileId, serverId, channelId, channelName, channelPath } = args;
  const { error } = await supabase
    .from("presences_teamspeak")
    .upsert({
      profile_id: profileId,
      server_id: serverId,
      channel_id: channelId,
      channel_name: channelName ?? undefined,
      channel_path: channelPath ?? undefined,
      status: "online",
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "profile_id,server_id" });

  if (error) {
    console.error("Failed to upsert TeamSpeak presence", error);
  }
}

async function ensureServerGroups(args: {
  client: TeamSpeakClient;
  server: TeamSpeakServerDefinition;
  uniqueId: string;
  profile: Tables<"profiles">;
  role: Tables<"user_roles">["role"] | null;
}): Promise<void> {
  const targetGroups = computeTargetGroupIds(args.server, args.profile, args.role);
  if (!targetGroups.length) return;

  const dbLookup = await sendRawCommand(args.client, "clientgetdbidfromuid", { cluid: args.uniqueId }) as {
    response?: Array<{ cldbid?: number | string }>;
  };
  const record = dbLookup.response?.[0];
  if (!record?.cldbid) return;

  const clientDbId = Number(record.cldbid);
  if (!Number.isFinite(clientDbId)) return;

  for (const groupId of targetGroups) {
    try {
      await sendRawCommand(args.client, "servergroupaddclient", { sgid: groupId, cldbid: clientDbId });
    } catch (error) {
      if (isAlreadyAssignedError(error)) continue;
      console.warn("Failed to assign TS group", { groupId, uniqueId: args.uniqueId, error });
    }
  }
}

function computeTargetGroupIds(
  server: TeamSpeakServerDefinition,
  profile: Tables<"profiles">,
  role: Tables<"user_roles">["role"] | null,
): number[] {
  const groups = new Set<number>();

  if (server.roleRegisteredGroupId && role !== "admin" && role !== "moderator") {
    groups.add(server.roleRegisteredGroupId);
  }

  if (role === "admin" && server.roleAdminGroupId) {
    groups.add(server.roleAdminGroupId);
  } else if (role === "moderator" && server.roleModeratorGroupId) {
    groups.add(server.roleModeratorGroupId);
  }

  if ((profile.supporter_patreon || profile.supporter_lifetime) && server.roleSupporterGroupId) {
    groups.add(server.roleSupporterGroupId);
  }

  if (profile.supporter_lifetime && server.roleLifetimeSupporterGroupId) {
    groups.add(server.roleLifetimeSupporterGroupId);
  }

  return Array.from(groups);
}

function channelsFindName(channels: unknown[], channelId: string | null): string | null {
  if (!channelId) return null;
  const match = (channels as Array<{ cid?: number | string; channel_name?: string }>).find((c) => String(c.cid) === channelId);
  return match?.channel_name ?? null;
}

function channelsFindPath(_channels: unknown[], channelId: string | null): string[] | null {
  if (!channelId) return null;
  // channel_path not available from channellist; placeholder for future hierarchical resolution.
  return null;
}

async function loadProfileMap(): Promise<Map<string, Tables<"profiles">>> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, teamspeak_identities, supporter_patreon, supporter_lifetime, banned, rich_presence_disabled");

  if (error) throw error;

  const map = new Map<string, Tables<"profiles">>();
  for (const row of data ?? []) {
    const identities = (row as Tables<"profiles">).teamspeak_identities ?? [];
    for (const identity of identities) {
      map.set(`${identity.serverId}:${identity.uniqueId}`, row as Tables<"profiles">);
    }
  }
  return map;
}

async function loadRoleMap(): Promise<Map<string, Tables<"user_roles">["role"]>> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id, role");

  if (error) throw error;

  const map = new Map<string, Tables<"user_roles">["role"]>();
  for (const row of data ?? []) {
    map.set(row.user_id, row.role);
  }
  return map;
}

async function shutdownClient(client: TeamSpeakClient) {
  try {
    await client.send("logout");
  } catch (error) {
    console.warn("Failed to logout from TeamSpeak", error);
  }

  try {
    await sendRawCommand(client, "quit");
  } catch (_) {
    // ignore
  }
}

function sendRawCommand(
  client: TeamSpeakClient,
  cmd: string,
  params: Record<string, unknown> = {},
  options: string[] = [],
): Promise<unknown> {
  const untypedClient = client as unknown as {
    send: (command: string, commandParams?: Record<string, unknown>, opts?: string[]) => Promise<unknown>;
  };

  return untypedClient.send(cmd, params, options);
}

function buildUniqueNickname(base: string): string {
  const trimmed = base.trim();
  const suffix = Math.floor(Math.random() * 9000 + 1000).toString();
  return `${trimmed} #${suffix}`;
}

function buildServerAddress(server: TeamSpeakServerDefinition): string {
  const host = server.queryHost;
  const port = server.voicePort ?? server.queryPort ?? 9987;
  return `${host}:${port}`;
}

function isAlreadyAssignedError(error: unknown): boolean {
  if (!error) return false;

  if (typeof error === "object" && error !== null) {
    const typed = error as { error?: { id?: number; msg?: string }; message?: string };
    if (typed.error?.id === 2561) return true;
    if (typed.error?.id === 2568) return true;
    if (typeof typed.message === "string" && /already\s+in\s+servergroup/i.test(typed.message)) {
      return true;
    }
  }

  const message = typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : undefined;
  return Boolean(message && /already\s+in\s+servergroup|error\s+id=(2561|2568)/i.test(message));
}

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
