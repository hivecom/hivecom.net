import * as constants from "constants" with { type: "json" };
import { createClient } from "@supabase/supabase-js";
import { TeamSpeakClient } from "node-ts/lib/node-ts.js";
import { authorizeSystemCron } from "../_shared/auth.ts";
import { parseEnvMap } from "../_shared/env.ts";
import { normalizeTeamSpeakIdentities } from "../_shared/teamspeak.ts";
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

type ChannelRecord = {
  cid?: number | string;
  pid?: number | string;
  channel_order?: number | string;
  channel_name?: string;
  total_clients?: number | string;
  channel_needed_subscribe_power?: number | string;
};

type NormalizedChannel = {
  id: string;
  parentId: string | null;
  order: number;
  name: string;
  totalClients: number;
  subscribePower?: number;
  depth: number;
  path: string[];
  children: NormalizedChannel[];
  clients: NormalizedClient[];
};

type NormalizedClient = {
  uniqueId: string;
  nickname: string;
  channelId: string | null;
  channelName: string | null;
  channelPath: string[] | null;
  serverGroups: number[];
  away: boolean;
  muted: boolean;
  inputMuted: boolean;
  outputMuted: boolean;
};

type ServerInfo = {
  name?: string;
  platform?: string;
  version?: string;
  uptimeSeconds?: number;
  maxClients?: number;
  totalClients?: number;
  totalChannels?: number;
};

interface ServerSnapshot {
  id: string;
  title?: string;
  collectedAt: string;
  serverInfo?: ServerInfo;
  channels: NormalizedChannel[];
  clients: NormalizedClient[];
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

    const clientListQuery = await sendRawCommand(client, "clientlist", {}, ["-uid", "-voice", "-away", "-groups"]) as QueryResponse<TeamSpeakClientEntry>;

    const clientInfoCache = new Map<string, TeamSpeakClientEntry>();
    const groupIdentityMap = await buildGroupIdentityMap(client, server);

    const onlineClients = (clientListQuery.response ?? []).filter((c) =>
      String(c.client_type ?? "0") === "0" && (c.client_unique_identifier || c.client_database_id || c.clid)
    );

    const normalizedClients: ServerSnapshot["clients"] = [];

    for (const entry of onlineClients) {
      const hydratedEntry = await hydrateClientInfo(client, entry, clientInfoCache, groupIdentityMap);
      const normalizedUniqueId = hydratedEntry.client_unique_identifier ?? hydratedEntry.client_database_id ?? hydratedEntry.clid;
      if (!normalizedUniqueId) continue;

      const uniqueId = String(normalizedUniqueId);
      const nickname = hydratedEntry.client_nickname ?? "Unknown";
      const channelId = hydratedEntry.cid ? String(hydratedEntry.cid) : null;
      const channelMeta = channelId ? channelsNormalized.map.get(channelId) : undefined;
      const serverGroups = (hydratedEntry.client_servergroups ?? "")
        .split(",")
        .map((g: string) => Number(g))
        .filter((n: number) => Number.isFinite(n));
      const away = hydratedEntry.client_away === "1";
      const inputMuted = hydratedEntry.client_input_muted === "1";
      const outputMuted = hydratedEntry.client_output_muted === "1";
      const muted = inputMuted || outputMuted;

      const normalizedClient: NormalizedClient = {
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
        const role = roleMap.get(profile.id) ?? null;

        if (!profile.rich_presence_disabled) {
          await upsertPresenceRow({
            profileId: profile.id,
            serverId: server.id,
            channelId,
            channelName: channelMeta?.name ?? null,
            channelPath: channelMeta?.path ?? null,
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
      collectedAt,
      serverInfo,
      channels: channelsNormalized.tree,
      clients: normalizedClients,
    };
  } finally {
    await shutdownClient(client);
  }
}

async function buildGroupIdentityMap(client: TeamSpeakClient, server: TeamSpeakServerDefinition): Promise<Map<string, TeamSpeakClientEntry>> {
  const map = new Map<string, TeamSpeakClientEntry>();
  const groupIds = new Set<number>();

  if (server.roleRegisteredGroupId) groupIds.add(server.roleRegisteredGroupId);
  if (server.roleModeratorGroupId) groupIds.add(server.roleModeratorGroupId);
  if (server.roleAdminGroupId) groupIds.add(server.roleAdminGroupId);
  if (server.roleSupporterGroupId) groupIds.add(server.roleSupporterGroupId);

  for (const sgid of groupIds) {
    const groupQuery = await sendRawCommand(client, "servergroupclientlist", { sgid }, ["-names"]) as QueryResponse<TeamSpeakClientEntry>;
    for (const entry of groupQuery.response ?? []) {
      const databaseId = (entry as { cldbid?: number | string }).cldbid ?? entry.client_database_id;
      if (databaseId === undefined || databaseId === null) continue;
      const key = String(databaseId);
      if (!key) continue;
      map.set(key, entry);
    }
  }

  return map;
}

async function hydrateClientInfo(
  client: TeamSpeakClient,
  entry: TeamSpeakClientEntry,
  cache: Map<string, TeamSpeakClientEntry>,
  groupIdentityMap: Map<string, TeamSpeakClientEntry>,
): Promise<TeamSpeakClientEntry> {
  if (entry.client_unique_identifier) return entry;

  const databaseId = entry.client_database_id ?? entry.clid;
  if (databaseId !== undefined && databaseId !== null) {
    const groupEntry = groupIdentityMap.get(String(databaseId));
    if (groupEntry?.client_unique_identifier) {
      return {
        ...entry,
        client_unique_identifier: groupEntry.client_unique_identifier,
        client_nickname: entry.client_nickname ?? groupEntry.client_nickname,
      };
    }
  }

  const clid = entry.clid;
  if (clid === undefined || clid === null) return entry;

  const cacheKey = String(clid);
  const cached = cache.get(cacheKey);
  if (cached?.client_unique_identifier) {
    return {
      ...entry,
      client_unique_identifier: cached.client_unique_identifier,
      client_nickname: entry.client_nickname ?? cached.client_nickname,
    };
  }

  const infoQuery = await sendRawCommand(client, "clientinfo", { clid }) as QueryResponse<TeamSpeakClientEntry>;
  const info = infoQuery.response?.[0];

  if (info?.client_unique_identifier) {
    cache.set(cacheKey, info);
    return {
      ...entry,
      client_unique_identifier: info.client_unique_identifier,
      client_nickname: entry.client_nickname ?? info.client_nickname,
    };
  }

  if (info) cache.set(cacheKey, info);
  return entry;
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

  // Lifetime supporters use the regular supporter group when defined.

  return Array.from(groups);
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

function normalizeChannels(records: ChannelRecord[]): { tree: NormalizedChannel[]; map: Map<string, NormalizedChannel> } {
  const map = new Map<string, NormalizedChannel>();

  for (const record of records) {
    const id = String(record.cid ?? "");
    if (!id) continue;

    const parentId = record.pid !== undefined && record.pid !== null ? String(record.pid) : null;
    const order = Number(record.channel_order ?? 0);
    const channel: NormalizedChannel = {
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
  const sortChildren = (node: NormalizedChannel) => {
    node.children.sort((a, b) => a.order - b.order);
    for (const child of node.children) sortChildren(child);
  };

  const roots: NormalizedChannel[] = [];
  for (const channel of map.values()) {
    if (!channel.parentId || !map.has(channel.parentId)) {
      roots.push(channel);
    }
  }

  for (const root of roots) {
    sortChildren(root);
  }

  // Build depth and path
  const buildPaths = (node: NormalizedChannel, path: string[], depth: number) => {
    node.depth = depth;
    node.path = [...path, node.name];
    for (const child of node.children) buildPaths(child, node.path, depth + 1);
  };

  for (const root of roots) {
    buildPaths(root, [], 0);
  }

  return { tree: roots, map };
}

function normalizeServerInfo(raw: Record<string, unknown> | null): ServerInfo | undefined {
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
