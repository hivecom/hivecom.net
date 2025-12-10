import * as constants from "constants" with { type: "json" };
import { TeamSpeakClient } from "node-ts/lib/node-ts.js";
import { parseEnvMap } from "./env.ts";
import type { Tables } from "database-types";
import type {
  TeamSpeakNormalizedChannel,
  TeamSpeakNormalizedClient,
  TeamSpeakServerInfo,
  TeamSpeakServerSnapshot,
} from "teamspeak-types";
import type { TeamSpeakIdentityRecord } from "../../../types/teamspeak.ts";

export function normalizeTeamSpeakIdentities(
  value: Tables<"profiles">["teamspeak_identities"] | TeamSpeakIdentityRecord[] | null | undefined,
): TeamSpeakIdentityRecord[] {
  if (!Array.isArray(value)) return [];

  const normalized: TeamSpeakIdentityRecord[] = [];

  value.forEach((entry) => {
    if (entry === null || entry === undefined || typeof entry !== "object") return;

    const rawServerId = (entry as { serverId?: unknown }).serverId;
    const rawUniqueId = (entry as { uniqueId?: unknown }).uniqueId;
    const linkedAt = (entry as { linkedAt?: unknown }).linkedAt;

    if (typeof rawServerId !== "string" || typeof rawUniqueId !== "string") return;

    const serverId = rawServerId.trim();
    const uniqueId = rawUniqueId.trim();

    if (!serverId || !uniqueId) return;

    normalized.push({
      serverId,
      uniqueId,
      linkedAt: typeof linkedAt === "string" ? linkedAt : undefined,
    });
  });

  return normalized;
}

export function identityKey(identity: TeamSpeakIdentityRecord): string {
  return `${identity.serverId}:${identity.uniqueId}`;
}

export interface TeamSpeakServerDefinition {
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
  roleLifetimeSupporterGroupId?: number;
}

// Supabase client alias kept loose to avoid cross-runtime auth type mismatches
// deno-lint-ignore no-explicit-any
export type SupabaseDbClient = any;

export interface CredentialsMap {
  usernames: Map<string, string>;
  passwords: Map<string, string>;
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

interface AppConstants {
  PLATFORMS?: { TEAMSPEAK?: { servers?: TeamSpeakServerDefinition[] } };
}

export const TEAMSPEAK_TIMEOUT_MS = 15_000;
export const BUCKET = "hivecom-content-static";
export const SNAPSHOT_PATH = "teamspeak/state.json";

const appConstants = (constants as unknown as { default: AppConstants }).default;
const teamSpeakPlatform = (appConstants?.PLATFORMS?.TEAMSPEAK ?? {}) as {
  servers?: TeamSpeakServerDefinition[];
};

export function getTeamSpeakServers(): TeamSpeakServerDefinition[] {
  if (Array.isArray(teamSpeakPlatform.servers)) {
    return teamSpeakPlatform.servers as TeamSpeakServerDefinition[];
  }
  return [];
}

export function buildTeamSpeakCredentials(
  usernames?: string,
  passwords?: string,
): CredentialsMap {
  return {
    usernames: parseEnvMap(usernames),
    passwords: parseEnvMap(passwords),
  };
}

export type SnapshotPayload = {
  collectedAt: string;
  servers: TeamSpeakServerSnapshot[];
};

export async function fetchSnapshotFromStorage(
  supabase: SupabaseDbClient,
): Promise<SnapshotPayload | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(SNAPSHOT_PATH);

  if (error) {
    if ((error as { statusCode?: number }).statusCode !== 404) {
      console.warn("Failed to download TeamSpeak snapshot", error);
    }
    return null;
  }

  if (!data) return null;

  try {
    const text = await data.text();
    return JSON.parse(text) as SnapshotPayload;
  } catch (parseError) {
    console.warn("Failed to parse TeamSpeak snapshot from storage", parseError);
    return null;
  }
}

export async function storeSnapshot(
  supabase: SupabaseDbClient,
  payload: SnapshotPayload,
): Promise<void> {
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(
      SNAPSHOT_PATH,
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      { upsert: true, cacheControl: "60", contentType: "application/json" },
    );

  if (uploadError) {
    throw new Error(`Failed to upload TeamSpeak snapshot: ${uploadError.message}`);
  }
}

export function isSnapshotFresh(payload: SnapshotPayload | null, maxAgeMs: number): boolean {
  if (!payload?.collectedAt) return false;
  const collected = Date.parse(payload.collectedAt);
  if (Number.isNaN(collected)) return false;
  return Date.now() - collected < maxAgeMs;
}

export async function collectSnapshots(args: {
  servers: TeamSpeakServerDefinition[];
  credentials: CredentialsMap;
}): Promise<TeamSpeakServerSnapshot[]> {
  const { servers, credentials } = args;

  if (!servers.length) {
    throw new Error("No TeamSpeak servers configured");
  }

  const snapshots: TeamSpeakServerSnapshot[] = [];
  for (const server of servers) {
    const snapshot = await processServer({
      server,
      credentials,
    });
    snapshots.push(snapshot);
  }

  return snapshots;
}

export async function loadTeamSpeakProfileMap(
  supabase: SupabaseDbClient,
): Promise<Map<string, Tables<"profiles">>> {
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

export async function loadTeamSpeakRoleMap(
  supabase: SupabaseDbClient,
): Promise<Map<string, Tables<"user_roles">["role"]>> {
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

export async function updatePresenceFromSnapshots(args: {
  supabase: SupabaseDbClient;
  snapshots: TeamSpeakServerSnapshot[];
  profileMap?: Map<string, Tables<"profiles">>;
}): Promise<void> {
  const { supabase, snapshots, profileMap: providedProfileMap } = args;
  const profileMap = providedProfileMap ?? (await loadTeamSpeakProfileMap(supabase));

  for (const snapshot of snapshots) {
    for (const client of snapshot.clients) {
      const profile = profileMap.get(`${snapshot.id}:${client.uniqueId}`);
      if (!profile || profile.banned || profile.rich_presence_disabled) continue;

      const { error } = await supabase
        .from("presences_teamspeak")
        .upsert(
          {
            profile_id: profile.id,
            server_id: snapshot.id,
            channel_id: client.channelId,
            channel_name: client.channelName ?? undefined,
            channel_path: client.channelPath ?? undefined,
            status: "online",
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "profile_id,server_id" },
        );

      if (error) {
        console.error("Failed to upsert TeamSpeak presence", error);
      }
    }
  }
}

export async function ensureTeamSpeakGroupAssignments(args: {
  snapshots: TeamSpeakServerSnapshot[];
  servers: TeamSpeakServerDefinition[];
  credentials: CredentialsMap;
  profileMap: Map<string, Tables<"profiles">>;
  roleMap: Map<string, Tables<"user_roles">["role"]>;
}): Promise<void> {
  const { snapshots, servers, credentials, profileMap, roleMap } = args;
  const serverMap = new Map<string, TeamSpeakServerDefinition>();
  servers.forEach((s) => serverMap.set(s.id, s));

  for (const snapshot of snapshots) {
    const server = serverMap.get(snapshot.id);
    if (!server) continue;

    const username = credentials.usernames.get(server.id);
    const password = credentials.passwords.get(server.id);
    if (!username || !password) continue;

    const managedGroups = new Set<number>(
      [
        server.roleAdminGroupId,
        server.roleModeratorGroupId,
        server.roleSupporterGroupId,
        server.roleRegisteredGroupId,
        server.roleLifetimeSupporterGroupId,
      ].filter((n): n is number => typeof n === "number" && Number.isFinite(n)),
    );

    if (managedGroups.size === 0) continue;

    const client = new TeamSpeakClient(server.queryHost, server.queryPort ?? 10011);

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

      for (const clientSnapshot of snapshot.clients) {
        const profile = profileMap.get(`${server.id}:${clientSnapshot.uniqueId}`);
        if (!profile || profile.banned) continue;

        const role = roleMap.get(profile.id);
        const desired = computeDesiredGroups({ server, profile, role });
        if (desired.size === 0) continue;

        const current = new Set<number>((clientSnapshot.serverGroups ?? []).filter((n) => Number.isFinite(n)));
        const toAdd = [...desired].filter((g) => !current.has(g));
        const toRemove = [...current].filter((g) => managedGroups.has(g) && !desired.has(g));

        if (toAdd.length === 0 && toRemove.length === 0) continue;

        const dbId = clientSnapshot.databaseId;
        if (!dbId) {
          console.warn("Missing databaseId in snapshot; skipping group sync", {
            serverId: server.id,
            uniqueId: clientSnapshot.uniqueId,
          });
          continue;
        }

        for (const sgid of toAdd) {
          try {
            await sendRawCommand(client, "servergroupaddclient", { sgid, cldbid: dbId });
          } catch (error) {
            if (!isAlreadyAssignedError(error)) {
              throw error;
            }
          }
          await sleep(100);
        }

        for (const sgid of toRemove) {
          await sendRawCommand(client, "servergroupdelclient", { sgid, cldbid: dbId });
          await sleep(100);
        }
      }
    } catch (error) {
      console.error(`Failed to ensure groups for server ${server.id}`, error);
    } finally {
      await shutdownClient(client);
    }
  }
}

function computeDesiredGroups(args: {
  server: TeamSpeakServerDefinition;
  profile: Tables<"profiles">;
  role: Tables<"user_roles">["role"] | undefined;
}): Set<number> {
  const { server, profile, role } = args;
  const desired = new Set<number>();

  if (role !== "admin" && role !== "moderator" && typeof server.roleRegisteredGroupId === "number") {
    desired.add(server.roleRegisteredGroupId);
  }

  if (role === "admin" && typeof server.roleAdminGroupId === "number") {
    desired.add(server.roleAdminGroupId);
  } else if (role === "moderator" && typeof server.roleModeratorGroupId === "number") {
    desired.add(server.roleModeratorGroupId);
  }

  const isSupporter = !!(profile.supporter_lifetime || profile.supporter_patreon);
  if (isSupporter && typeof server.roleSupporterGroupId === "number") {
    desired.add(server.roleSupporterGroupId);
  }

  if (profile.supporter_lifetime && typeof server.roleLifetimeSupporterGroupId === "number") {
    desired.add(server.roleLifetimeSupporterGroupId);
  }

  return desired;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processServer(args: {
  server: TeamSpeakServerDefinition;
  credentials: CredentialsMap;
}): Promise<TeamSpeakServerSnapshot> {
  const { server, credentials } = args;
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

    const serverInfoQuery = (await sendRawCommand(client, "serverinfo")) as QueryResponse<Record<string, unknown>>;
    const serverInfo = normalizeServerInfo(serverInfoQuery.response?.[0] ?? null);

    const channelsQuery = (await sendRawCommand(client, "channellist")) as QueryResponse<ChannelRecord>;
    const channelResponse = channelsQuery.response ?? [];
    const channelsNormalized = normalizeChannels(channelResponse);

    const clientListQuery = (await sendRawCommand(
      client,
      "clientlist",
      {},
      ["uid", "voice", "away", "groups", "times", "country"],
    )) as QueryResponse<TeamSpeakClientEntry>;

    const onlineClients = (clientListQuery.response ?? []).filter((c) =>
      String(c.client_type ?? "0") === "0" && (c.client_unique_identifier || c.client_database_id || c.clid)
    );

    const normalizedClients: TeamSpeakServerSnapshot["clients"] = [];

    for (const entry of onlineClients) {
      const uniqueId = resolveUniqueId(entry);
      if (!uniqueId) {
        console.warn("TS client missing identifier after resolution", entry);
        continue;
      }
      if (uniqueId === "serveradmin") continue;

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
      const country = typeof entry.client_country === "string" ? entry.client_country : null;
      const createdAt = safeNumber(entry.client_created) ?? null;
      const lastConnectedAt = safeNumber(entry.client_lastconnected) ?? null;

      const databaseId = entry.client_database_id !== undefined && entry.client_database_id !== null
        ? String(entry.client_database_id)
        : null;

      const normalizedClient: TeamSpeakNormalizedClient = {
        uniqueId,
        databaseId,
        nickname,
        channelId,
        channelName: channelMeta?.name ?? null,
        channelPath: channelMeta?.path ?? null,
        serverGroups,
        away,
        muted,
        inputMuted,
        outputMuted,
        country,
        createdAt,
        lastConnectedAt,
      };

      normalizedClients.push(normalizedClient);

      if (channelId) {
        const channel = channelsNormalized.map.get(channelId);
        if (channel) {
          channel.clients.push(normalizedClient);
        }
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

  for (const channel of map.values()) {
    if (channel.parentId && map.has(channel.parentId)) {
      map.get(channel.parentId)!.children.push(channel);
    }
  }

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

type TeamSpeakClientEntry = {
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
  client_country?: string;
  client_created?: number | string;
  client_lastconnected?: number | string;
};
