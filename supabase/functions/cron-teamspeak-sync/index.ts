import * as constants from "constants" with { type: "json" };
import { createClient } from "@supabase/supabase-js";
import { TeamSpeakClient } from "node-ts/lib/node-ts.js";
import { authorizeSystemCron } from "../_shared/auth.ts";
import { parseEnvMap } from "../_shared/env.ts";
import { normalizeTeamSpeakIdentities } from "../_shared/teamspeak.ts";
import type { Database, Tables } from "database-types";
import type {
  TeamSpeakNormalizedChannel,
  TeamSpeakNormalizedClient,
  TeamSpeakServerInfo,
  TeamSpeakServerSnapshot,
} from "teamspeak-types";

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

type QueryResponse<T> = {
  cmd?: string;
  options?: unknown;
  text?: string;
  parameters?: unknown;
  error?: { id?: number; msg?: string } | null;
  response?: T[];
  rawResponse?: string;
};

type RawSnapshots = {
  serverId: string;
  clientlistRaw?: string;
  serverinfoRaw?: string;
  channellistRaw?: string;
};

type ChannelRecord = {
  cid?: number | string;
  pid?: number | string;
  channel_order?: number | string;
  channel_name?: string;
  total_clients?: number | string;
  channel_needed_subscribe_power?: number | string;
};

interface AppConstants {
  PLATFORMS?: { TEAMSPEAK?: { servers?: TeamSpeakServerDefinition[] } };
}

const appConstants = (constants as unknown as { default: AppConstants }).default;
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

    const snapshots: TeamSpeakServerSnapshot[] = [];
    const raw: RawSnapshots[] = [];

    for (const server of availableServers) {
      const snapshotResult = await processServer({ server, profileMap, roleMap });
      snapshots.push(snapshotResult.snapshot);
      raw.push({
        serverId: server.id,
        clientlistRaw: snapshotResult.raw.clientlistRaw,
        serverinfoRaw: snapshotResult.raw.serverinfoRaw,
        channellistRaw: snapshotResult.raw.channellistRaw,
      });
    }

    const payload = {
      collectedAt: new Date().toISOString(),
      servers: snapshots,
      raw,
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
}): Promise<{ snapshot: TeamSpeakServerSnapshot; raw: RawSnapshots }> {
  const { server, profileMap, roleMap } = args;
  const username = credentials.usernames.get(server.id);
  const password = credentials.passwords.get(server.id);

  if (!username || !password) {
    throw new Error(`Missing TeamSpeak credentials for server "${server.id}"`);
  }

  const client = new TeamSpeakClient(server.queryHost, server.queryPort ?? 10011);
  const collectedAt = new Date().toISOString();

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

    const serverInfoQuery = await sendRawCommand(client, "serverinfo") as QueryResponse<Record<string, unknown>>;
    const serverInfo = normalizeServerInfo(serverInfoQuery.response?.[0] ?? null);

    const channelsQuery = await sendRawCommand(client, "channellist") as QueryResponse<ChannelRecord>;
    const channelResponse = channelsQuery.response ?? [];
    const channelsNormalized = normalizeChannels(channelResponse);

    const clientListQuery = await sendRawCommand(
      client,
      "clientlist",
      {},
      ["uid", "voice", "away", "groups", "times", "ip", "country", "badges"],
    ) as QueryResponse<TeamSpeakClientEntry>;

    const onlineClients = (clientListQuery.response ?? []).filter((c) =>
      String(c.client_type ?? "0") === "0" && (c.client_unique_identifier || c.client_database_id || c.clid)
    );

    const normalizedClients: TeamSpeakServerSnapshot["clients"] = [];

    for (const entry of onlineClients) {
        const uniqueId = await resolveUniqueId(entry);
      if (!uniqueId) {
        console.warn("TS client missing identifier after resolution", entry);
        continue;
      }
      const nickname = entry.client_nickname ?? "Unknown";
      const channelId = entry.cid ? String(entry.cid) : null;
      const channelMeta = channelId ? channelsNormalized.map.get(channelId) : undefined;
      const serverGroupsToken = String(entry.client_servergroups ?? "").trim().split(/\s+/)[0] ?? "";
      const serverGroups = serverGroupsToken
        .split(",")
        .map((g: string) => g.trim())
        .filter((g) => g.length > 0)
        .map((g) => Number(g))
        .filter((n) => Number.isFinite(n));
      const away = entry.client_away === "1";
      const inputMuted = entry.client_input_muted === "1";
      const outputMuted = entry.client_output_muted === "1";
      const muted = inputMuted || outputMuted;

      const normalizedClient: TeamSpeakNormalizedClient = {
        uniqueId,
        nickname,
        channelId,
        channelName: channelMeta?.name ?? null,
        channelPath: channelMeta?.path ?? null,
        serverGroups,
        away,
        muted,
        inputMuted,
        outputMuted,
      };

      normalizedClients.push(normalizedClient);

      if (channelId) {
        const channel = channelsNormalized.map.get(channelId);
        if (channel) {
          channel.clients.push(normalizedClient);
        }
      }

      const profile = profileMap.get(`${server.id}:${uniqueId}`);
      if (profile && !profile.banned) {
        const _role = roleMap.get(profile.id) ?? null;

        if (!profile.rich_presence_disabled) {
          await upsertPresenceRow({
            profileId: profile.id,
            serverId: server.id,
            channelId,
            channelName: channelMeta?.name ?? null,
            channelPath: channelMeta?.path ?? null,
          });
        }
      }
    }

    return {
      snapshot: {
        id: server.id,
        title: server.title,
        collectedAt,
        serverInfo,
        channels: channelsNormalized.tree,
        clients: normalizedClients,
      },
      raw: {
        serverId: server.id,
        clientlistRaw: clientListQuery.rawResponse,
        serverinfoRaw: serverInfoQuery.rawResponse,
        channellistRaw: channelsQuery.rawResponse,
      },
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

async function loadProfileMap(): Promise<Map<string, Tables<"profiles">>> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, teamspeak_identities, supporter_patreon, supporter_lifetime, banned, rich_presence_disabled");

  if (error) throw error;

  const map = new Map<string, Tables<"profiles">>();
  for (const row of data ?? []) {
    const identities = normalizeTeamSpeakIdentities((row as Tables<"profiles">).teamspeak_identities);
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
    await sendRawCommand(client, "quit");
  } catch (error) {
    console.warn("Failed to quit TeamSpeak session", error);
  }
}

function resolveUniqueId(entry: TeamSpeakClientEntry): string | null {
  const direct = entry.client_unique_identifier ?? null;
  return direct ? String(direct) : null;
}

function sendRawCommand(
  client: TeamSpeakClient,
  cmd: string,
  params: Record<string, unknown> | undefined = undefined,
  options: string[] = [],
): Promise<unknown> {
  const safeParams = params && Object.keys(params).length > 0 ? params : {};
  const safeOptions = Array.isArray(options) ? options : [];
  return client.send(cmd, safeParams, safeOptions);
}

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function normalizeChannels(records: ChannelRecord[]): { tree: TeamSpeakNormalizedChannel[]; map: Map<string, TeamSpeakNormalizedChannel> } {
  const map = new Map<string, TeamSpeakNormalizedChannel>();

  for (const record of records) {
    const id = String(record.cid ?? "");
    if (!id) continue;

    const parentId = record.pid !== undefined && record.pid !== null ? String(record.pid) : null;
    const order = Number(record.channel_order ?? 0);
    const channel: TeamSpeakNormalizedChannel = {
      id,
      parentId,
      order: Number.isFinite(order) ? order : 0,
      name: record.channel_name ?? "Unnamed Channel",
      totalClients: safeNumber(record.total_clients) ?? 0,
      subscribePower: safeNumber(record.channel_needed_subscribe_power) ?? undefined,
      depth: 0,
      path: [],
      children: [],
      clients: [],
    };

    map.set(id, channel);
  }

  // Attach children
  for (const channel of map.values()) {
    if (channel.parentId && map.has(channel.parentId)) {
      map.get(channel.parentId)!.children.push(channel);
    }
  }

  // Sort children by order
  const sortChildren = (node: TeamSpeakNormalizedChannel) => {
    node.children.sort((a, b) => a.order - b.order);
    for (const child of node.children) sortChildren(child);
  };

  const roots: TeamSpeakNormalizedChannel[] = [];
  for (const channel of map.values()) {
    if (!channel.parentId || !map.has(channel.parentId)) {
      roots.push(channel);
    }
  }

  for (const root of roots) {
    sortChildren(root);
  }

  // Build depth and path
  const buildPaths = (node: TeamSpeakNormalizedChannel, path: string[], depth: number) => {
    node.depth = depth;
    node.path = [...path, node.name];
    for (const child of node.children) buildPaths(child, node.path, depth + 1);
  };

  for (const root of roots) {
    buildPaths(root, [], 0);
  }

  return { tree: roots, map };
}

function normalizeServerInfo(raw: Record<string, unknown> | null): TeamSpeakServerInfo | undefined {
  if (!raw) return undefined;

  return {
    name: typeof raw.virtualserver_name === "string" ? raw.virtualserver_name : undefined,
    platform: typeof raw.virtualserver_platform === "string" ? raw.virtualserver_platform : undefined,
    version: typeof raw.virtualserver_version === "string" ? raw.virtualserver_version : undefined,
    uptimeSeconds: safeNumber(raw.virtualserver_uptime),
    maxClients: safeNumber(raw.virtualserver_maxclients),
    totalClients: safeNumber(raw.virtualserver_clientsonline),
    totalChannels: safeNumber(raw.virtualserver_channelsonline),
  };
}

function safeNumber(value: unknown): number | undefined {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}
