import * as constants from "constants" with { type: "json" };
import { TeamSpeakClient } from "node-ts/lib/node-ts.js";
import { parseEnvMap } from "./env.ts";
import { sleep } from "./utils.ts";
import type { Tables } from "database-types";
import type {
  TeamSpeakClientAvatar,
  TeamSpeakGroup,
  TeamSpeakNormalizedChannel,
  TeamSpeakNormalizedClient,
  TeamSpeakServerInfo,
  TeamSpeakServerSnapshot,
} from "teamspeak-types";
import type { TeamSpeakIdentityRecord } from "../../../types/teamspeak.ts";

export function normalizeTeamSpeakIdentities(
  value:
    | Tables<"profiles">["teamspeak_identities"]
    | TeamSpeakIdentityRecord[]
    | null
    | undefined,
): TeamSpeakIdentityRecord[] {
  if (!Array.isArray(value)) return [];

  const normalized: TeamSpeakIdentityRecord[] = [];

  value.forEach((entry) => {
    if (entry === null || entry === undefined || typeof entry !== "object") {
      return;
    }

    const rawServerId = (entry as { serverId?: unknown }).serverId;
    const rawUniqueId = (entry as { uniqueId?: unknown }).uniqueId;
    const linkedAt = (entry as { linkedAt?: unknown }).linkedAt;

    if (typeof rawServerId !== "string" || typeof rawUniqueId !== "string") {
      return;
    }

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
  channel_needed_talk_power?: number | string;
  channel_needed_subscribe_power?: number | string;
};

interface AppConstants {
  PLATFORMS?: { TEAMSPEAK?: { servers?: TeamSpeakServerDefinition[] } };
}

export const TEAMSPEAK_TIMEOUT_MS = 15_000;
export const BUCKET = "hivecom-content-static";
export const SNAPSHOT_PATH = "teamspeak/state.json";
const AVATAR_PREFIX = "teamspeak/avatars";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const FILE_TRANSFER_CONNECT_TIMEOUT_MS = 5_000;

// ServerQuery's "insufficient client permissions".
const PERMISSION_ERROR_ID = 2568;

const appConstants =
  (constants as unknown as { default: AppConstants }).default;
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
  const { data, error } = await supabase.storage.from(BUCKET).download(
    SNAPSHOT_PATH,
  );

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
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
      { upsert: true, cacheControl: "60", contentType: "application/json" },
    );

  if (uploadError) {
    throw new Error(
      `Failed to upload TeamSpeak snapshot: ${uploadError.message}`,
    );
  }
}

export function isSnapshotFresh(
  payload: SnapshotPayload | null,
  maxAgeMs: number,
): boolean {
  if (!payload?.collectedAt) return false;
  const collected = Date.parse(payload.collectedAt);
  if (Number.isNaN(collected)) return false;
  return Date.now() - collected < maxAgeMs;
}

export async function collectSnapshots(args: {
  servers: TeamSpeakServerDefinition[];
  credentials: CredentialsMap;
  supabase: SupabaseDbClient;

  /** The last stored snapshot, so unchanged avatars aren't downloaded again. */
  previous: SnapshotPayload | null;
}): Promise<TeamSpeakServerSnapshot[]> {
  const { servers, credentials, supabase, previous } = args;

  if (!servers.length) {
    throw new Error("No TeamSpeak servers configured");
  }

  const knownAvatars = new Map<string, TeamSpeakClientAvatar>();
  for (const snapshot of previous?.servers ?? []) {
    for (const entry of snapshot.clients ?? []) {
      if (entry.avatar) {
        knownAvatars.set(`${snapshot.id}:${entry.uniqueId}`, entry.avatar);
      }
    }
  }

  const snapshots: TeamSpeakServerSnapshot[] = [];
  for (const server of servers) {
    const snapshot = await processServer({
      server,
      credentials,
      supabase,
      knownAvatars,
    });
    snapshots.push(snapshot);
  }

  return snapshots;
}

export async function loadTeamSpeakProfileMap(
  supabase: SupabaseDbClient,
): Promise<Map<string, Tables<"profiles">>> {
  const map = new Map<string, Tables<"profiles">>();

  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, teamspeak_identities, supporter_patreon, supporter_lifetime, banned, rich_presence_enabled",
      )
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw error;

    for (const row of (data ?? [])) {
      const identities = normalizeTeamSpeakIdentities(
        (row as Tables<"profiles">).teamspeak_identities,
      );
      for (const identity of identities) {
        map.set(
          `${identity.serverId}:${identity.uniqueId}`,
          row as Tables<"profiles">,
        );
      }
    }

    if (!data || data.length < pageSize) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return map;
}

export async function loadTeamSpeakRoleMap(
  supabase: SupabaseDbClient,
): Promise<Map<string, Tables<"user_roles">["role"]>> {
  const map = new Map<string, Tables<"user_roles">["role"]>();

  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw error;

    for (const row of (data ?? [])) {
      map.set(row.user_id, row.role);
    }

    if (!data || data.length < pageSize) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return map;
}

export async function updatePresenceFromSnapshots(args: {
  supabase: SupabaseDbClient;
  snapshots: TeamSpeakServerSnapshot[];
  profileMap?: Map<string, Tables<"profiles">>;
}): Promise<void> {
  const { supabase, snapshots, profileMap: providedProfileMap } = args;
  const profileMap = providedProfileMap ??
    (await loadTeamSpeakProfileMap(supabase));

  for (const snapshot of snapshots) {
    for (const client of snapshot.clients) {
      const profile = profileMap.get(`${snapshot.id}:${client.uniqueId}`);
      if (!profile || profile.banned || !profile.rich_presence_enabled) {
        continue;
      }

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

    const client = new TeamSpeakClient(
      server.queryHost,
      server.queryPort ?? 10011,
    );

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
        const profile = profileMap.get(
          `${server.id}:${clientSnapshot.uniqueId}`,
        );
        if (!profile || profile.banned) continue;

        const role = roleMap.get(profile.id);
        const desired = computeDesiredGroups({ server, profile, role });
        if (desired.size === 0) continue;

        const current = new Set<number>(
          (clientSnapshot.serverGroups ?? []).filter((n) => Number.isFinite(n)),
        );
        const toAdd = [...desired].filter((g) => !current.has(g));
        const toRemove = [...current].filter((g) =>
          managedGroups.has(g) && !desired.has(g)
        );

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
          await sleep(100);
          try {
            await sendRawCommand(client, "servergroupaddclient", {
              sgid,
              cldbid: dbId,
            });
          } catch (error) {
            if (!isAlreadyAssignedError(error)) {
              throw error;
            }
          }
        }

        for (const sgid of toRemove) {
          await sleep(100);
          await sendRawCommand(client, "servergroupdelclient", {
            sgid,
            cldbid: dbId,
          });
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

  if (
    role !== "admin" && role !== "moderator" &&
    typeof server.roleRegisteredGroupId === "number"
  ) {
    desired.add(server.roleRegisteredGroupId);
  }

  if (role === "admin" && typeof server.roleAdminGroupId === "number") {
    desired.add(server.roleAdminGroupId);
  } else if (
    role === "moderator" && typeof server.roleModeratorGroupId === "number"
  ) {
    desired.add(server.roleModeratorGroupId);
  }

  const isSupporter =
    !!(profile.supporter_lifetime || profile.supporter_patreon);
  if (isSupporter && typeof server.roleSupporterGroupId === "number") {
    desired.add(server.roleSupporterGroupId);
  }

  if (
    profile.supporter_lifetime &&
    typeof server.roleLifetimeSupporterGroupId === "number"
  ) {
    desired.add(server.roleLifetimeSupporterGroupId);
  }

  return desired;
}

async function processServer(args: {
  server: TeamSpeakServerDefinition;
  credentials: CredentialsMap;
  supabase: SupabaseDbClient;
  knownAvatars: Map<string, TeamSpeakClientAvatar>;
}): Promise<TeamSpeakServerSnapshot> {
  const { server, credentials, supabase, knownAvatars } = args;
  const username = credentials.usernames.get(server.id);
  const password = credentials.passwords.get(server.id);

  if (!username || !password) {
    throw new Error(`Missing TeamSpeak credentials for server "${server.id}"`);
  }

  const client = new TeamSpeakClient(
    server.queryHost,
    server.queryPort ?? 10011,
  );
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

    const serverInfoQuery =
      (await sendRawCommand(client, "serverinfo")) as QueryResponse<
        Record<string, unknown>
      >;
    const serverInfo = normalizeServerInfo(
      serverInfoQuery.response?.[0] ?? null,
    );

    const channelsQuery = (await sendRawCommand(
      client,
      "channellist",
      {},
      ["topic", "flags", "voice", "limits"],
    )) as QueryResponse<ChannelRecord>;
    const channelResponse = channelsQuery.response ?? [];
    const channelsNormalized = normalizeChannels(channelResponse);

    const serverGroups = await fetchGroups(client, "servergrouplist");
    const channelGroups = await fetchGroups(client, "channelgrouplist");

    const clientListQuery = await listClients(client);

    const onlineClients = (clientListQuery.response ?? []).filter((c) =>
      String(c.client_type ?? "0") === "0" &&
      (c.client_unique_identifier || c.client_database_id || c.clid)
    );

    const details = await fetchClientDetails(client, onlineClients);
    const transfer = { disabled: false };

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
      const channelMeta = channelId
        ? channelsNormalized.map.get(channelId)
        : undefined;
      const serverGroupsToken =
        String(entry.client_servergroups ?? "").trim().split(/\s+/)[0] ?? "";
      const serverGroups = serverGroupsToken
        .split(",")
        .map((g: string) => g.trim())
        .filter((g) => g.length > 0)
        .map((g) => Number(g))
        .filter((n) => Number.isFinite(n));
      const away = flagTrue(entry.client_away);
      const inputMuted = flagTrue(entry.client_input_muted);
      const outputMuted = flagTrue(entry.client_output_muted);
      const muted = inputMuted || outputMuted;
      const talkPower = safeNumber(entry.client_talk_power) ?? null;
      const channelRequiredTalkPower = channelMeta?.requiredTalkPower ?? null;
      const channelModerated = channelMeta?.moderated ?? false;
      const channelMuted = Boolean(
        (channelRequiredTalkPower !== null && channelRequiredTalkPower > 100) ||
          (channelRequiredTalkPower !== null &&
            (talkPower ?? 0) < channelRequiredTalkPower),
      );
      const country = typeof entry.client_country === "string"
        ? entry.client_country
        : null;
      const createdAt = safeNumber(entry.client_created) ?? null;
      const lastConnectedAt = safeNumber(entry.client_lastconnected) ?? null;

      const databaseId = entry.client_database_id !== undefined &&
          entry.client_database_id !== null
        ? String(entry.client_database_id)
        : null;

      const info = details.get(String(entry.clid));
      const avatar = await resolveAvatar({
        query: client,
        server,
        uniqueId,
        info,
        supabase,
        knownAvatars,
        transfer,
      });

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
        talkPower,
        channelRequiredTalkPower,
        channelModerated,
        channelMuted,
        country,
        createdAt,
        lastConnectedAt,
        channelGroupId: safeNumber(entry.client_channel_group_id) ?? null,
        idleTimeMs: safeNumber(entry.client_idle_time) ?? null,
        version: optionalString(entry.client_version),
        platform: optionalString(entry.client_platform),
        description: optionalString(info?.client_description),
        totalConnections: safeNumber(info?.client_totalconnections) ?? null,
        connectedTimeMs: safeNumber(info?.connection_connected_time) ?? null,
        avatar,
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
      serverGroups,
      channelGroups,
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

// Group names are cosmetic for the viewer, so a failure here (say the viewer
// query account lacks the list permission) drops them instead of the snapshot.
async function fetchGroups(
  client: TeamSpeakClient,
  command: "servergrouplist" | "channelgrouplist",
): Promise<TeamSpeakGroup[]> {
  try {
    const query = (await sendRawCommand(
      client,
      command,
    )) as QueryResponse<GroupRecord>;

    // Type 1 is a regular group. Templates (0) and query groups (2) never
    // show up on a voice client.
    return (query.response ?? [])
      .filter((group) => String(group.type) === "1")
      .map((group) => ({
        id: Number(group.sgid ?? group.cgid),
        name: String(group.name ?? ""),
      }))
      .filter((group) => Number.isFinite(group.id) && group.name.length > 0);
  } catch (error) {
    console.warn(`Failed to run TeamSpeak ${command}`, error);
    return [];
  }
}

// Description, total connections, session length and the avatar only come
// back from clientinfo, one client per call. The pause keeps a full server
// (32 slots) well inside the query flood limit, in case our address isn't
// whitelisted on the server.
async function fetchClientDetails(
  client: TeamSpeakClient,
  entries: TeamSpeakClientEntry[],
): Promise<Map<string, ClientInfoRecord>> {
  const map = new Map<string, ClientInfoRecord>();

  for (const entry of entries) {
    if (entry.clid === undefined || entry.clid === null) continue;

    await sleep(100);

    try {
      const query = (await sendRawCommand(client, "clientinfo", {
        clid: entry.clid,
      })) as QueryResponse<ClientInfoRecord>;

      const record = query.response?.[0];
      if (record) map.set(String(entry.clid), record);
    } catch (error) {
      // Without the permission every other call fails the same way.
      if (queryErrorId(error) === PERMISSION_ERROR_ID) {
        console.warn("TeamSpeak query account can't use clientinfo", error);
        break;
      }

      // The client can disconnect between clientlist and clientinfo.
      console.warn(
        `Failed to fetch TeamSpeak clientinfo for ${entry.clid}`,
        error,
      );
    }
  }

  return map;
}

// -info only adds version and platform. If the query account can't use it,
// the viewer still needs the list itself.
async function listClients(
  client: TeamSpeakClient,
): Promise<QueryResponse<TeamSpeakClientEntry>> {
  const options = ["uid", "voice", "away", "groups", "times", "country"];

  try {
    return (await sendRawCommand(client, "clientlist", {}, [
      ...options,
      "info",
    ])) as QueryResponse<TeamSpeakClientEntry>;
  } catch (error) {
    if (queryErrorId(error) !== PERMISSION_ERROR_ID) throw error;

    console.warn("TeamSpeak query account can't use clientlist -info", error);
    return (await sendRawCommand(
      client,
      "clientlist",
      {},
      options,
    )) as QueryResponse<TeamSpeakClientEntry>;
  }
}

function queryErrorId(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;

  return (error as { error?: { id?: number } }).error?.id;
}

// The stored avatar is keyed by the client's file id and versioned by
// client_flag_avatar (an md5 of the image), so it's only downloaded when the
// client changes it or wasn't in the last snapshot.
async function resolveAvatar(args: {
  query: TeamSpeakClient;
  server: TeamSpeakServerDefinition;
  uniqueId: string;
  info: ClientInfoRecord | undefined;
  supabase: SupabaseDbClient;
  knownAvatars: Map<string, TeamSpeakClientAvatar>;

  /** Flipped on the first failure so the rest of the run skips downloads. */
  transfer: { disabled: boolean };
}): Promise<TeamSpeakClientAvatar | null> {
  const { query, server, uniqueId, info, supabase, knownAvatars, transfer } =
    args;

  const hash = optionalString(info?.client_flag_avatar);
  const fileId = optionalString(info?.client_base64HashClientUID);
  if (!hash || !fileId) return null;

  const known = knownAvatars.get(`${server.id}:${uniqueId}`);
  if (known?.hash === hash) return known;
  if (transfer.disabled) return null;

  try {
    const bytes = await downloadAvatar(query, server.queryHost, fileId);
    if (!bytes) return null;

    // The bucket is public and serves files with the type we give them, so
    // anything that isn't recognizably an image never gets stored.
    const contentType = imageContentType(bytes);
    if (!contentType) {
      console.warn(`Skipping TeamSpeak avatar for ${uniqueId}: not an image`);
      return null;
    }

    const path = `${AVATAR_PREFIX}/${server.id}/${fileId}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, new Blob([bytes], { type: contentType }), {
        upsert: true,
        contentType,
        cacheControl: "86400",
      });

    if (error) throw error;

    return { path, hash };
  } catch (error) {
    // A missing permission, a closed port or a storage outage hits every
    // client the same way, and each blocked connect costs a full timeout.
    transfer.disabled = true;
    console.warn(
      `Failed to store TeamSpeak avatar for ${uniqueId}, skipping the rest this run`,
      error,
    );
    return null;
  }
}

async function downloadAvatar(
  query: TeamSpeakClient,
  queryHost: string,
  fileId: string,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const init = (await sendRawCommand(query, "ftinitdownload", {
    clientftfid: Math.floor(Math.random() * 0xffff),
    name: `/avatar_${fileId}`,
    cid: 0,
    cpw: "",
    seekpos: 0,
  })) as QueryResponse<FileTransferRecord>;

  const record = init.response?.[0];
  const status = safeNumber(record?.status) ?? 0;
  if (!record || status !== 0) {
    throw new Error(`ftinitdownload failed: ${record?.msg ?? status}`);
  }

  const size = safeNumber(record.size) ?? 0;
  const port = safeNumber(record.port);
  const key = optionalString(record.ftkey);
  if (size <= 0 || !port || !key) return null;

  if (size > MAX_AVATAR_BYTES) {
    console.warn(`Skipping TeamSpeak avatar ${fileId}: ${size} bytes`);
    return null;
  }

  // The server may list several addresses, or 0.0.0.0 when the file
  // transfer listens on the same host as the query.
  const advertised = optionalString(record.ip)?.split(",")[0]?.trim();
  const host = advertised && !advertised.startsWith("0.0.0.0")
    ? advertised
    : queryHost;

  return await readTransfer(host, port, key, size);
}

// The file transfer protocol is a raw TCP stream: send the key, then the
// server writes exactly `size` bytes and closes.
async function readTransfer(
  hostname: string,
  port: number,
  key: string,
  size: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const conn = await connectWithTimeout(hostname, port);
  const timer = setTimeout(() => closeQuietly(conn), TEAMSPEAK_TIMEOUT_MS);

  try {
    await conn.write(new TextEncoder().encode(key));

    const bytes = new Uint8Array(size);
    let offset = 0;

    while (offset < size) {
      const read = await conn.read(bytes.subarray(offset));
      if (read === null) {
        throw new Error(`Transfer ended at ${offset} of ${size} bytes`);
      }
      offset += read;
    }

    return bytes;
  } finally {
    clearTimeout(timer);
    closeQuietly(conn);
  }
}

// Deno.connect has no timeout of its own, and a firewall that drops packets
// leaves it hanging for minutes.
async function connectWithTimeout(
  hostname: string,
  port: number,
): Promise<Deno.Conn> {
  const connecting = Deno.connect({ hostname, port });
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Close the socket if it does connect after we've given up on it.
      connecting.then(closeQuietly, () => {});
      reject(new Error(`Timed out connecting to ${hostname}:${port}`));
    }, FILE_TRANSFER_CONNECT_TIMEOUT_MS);
  });

  try {
    return await Promise.race([connecting, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function closeQuietly(conn: Deno.Conn) {
  try {
    conn.close();
  } catch {
    // Already closed by the timeout or the server.
  }
}

function imageContentType(bytes: Uint8Array): string | null {
  const startsWith = (signature: number[], offset = 0) =>
    signature.every((byte, i) => bytes[offset + i] === byte);

  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (
    startsWith([0x52, 0x49, 0x46, 0x46]) &&
    startsWith([0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }

  return null;
}

function resolveUniqueId(entry: TeamSpeakClientEntry): string | null {
  const direct = entry.client_unique_identifier ?? null;
  return direct ? String(direct) : null;
}

function isAlreadyAssignedError(error: unknown): boolean {
  if (!error) return false;

  if (typeof error === "object" && error !== null) {
    const typed = error as {
      error?: { id?: number; msg?: string };
      message?: string;
    };
    if (typed.error?.id === 2561) return true;
    if (typed.error?.id === 2568) return true;
    if (
      typeof typed.message === "string" &&
      /already\s+in\s+servergroup/i.test(typed.message)
    ) {
      return true;
    }
  }

  const message = typeof error === "string"
    ? error
    : error instanceof Error
    ? error.message
    : undefined;
  return Boolean(
    message &&
      /already\s+in\s+servergroup|error\s+id=(2561|2568)/i.test(message),
  );
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

function normalizeChannels(
  records: ChannelRecord[],
): {
  tree: TeamSpeakNormalizedChannel[];
  map: Map<string, TeamSpeakNormalizedChannel>;
} {
  const map = new Map<string, TeamSpeakNormalizedChannel>();

  for (const record of records) {
    const id = String(record.cid ?? "");
    if (!id) continue;

    const parentId = record.pid !== undefined && record.pid !== null
      ? String(record.pid)
      : null;
    const order = Number(record.channel_order ?? 0);
    const requiredTalkPower = safeNumber(record.channel_needed_talk_power);
    const moderated = (requiredTalkPower ?? 0) > 0;
    const muted = (requiredTalkPower ?? 0) > 100;
    const channel: TeamSpeakNormalizedChannel = {
      id,
      parentId,
      order: Number.isFinite(order) ? order : 0,
      name: record.channel_name ?? "Unnamed Channel",
      totalClients: safeNumber(record.total_clients) ?? 0,
      requiredTalkPower,
      moderated,
      muted,
      subscribePower: safeNumber(record.channel_needed_subscribe_power) ??
        undefined,
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

  const buildPaths = (
    node: TeamSpeakNormalizedChannel,
    path: string[],
    depth: number,
  ) => {
    node.depth = depth;
    node.path = [...path, node.name];
    for (const child of node.children) buildPaths(child, node.path, depth + 1);
  };

  for (const root of roots) {
    buildPaths(root, [], 0);
  }

  return { tree: roots, map };
}

function normalizeServerInfo(
  raw: Record<string, unknown> | null,
): TeamSpeakServerInfo | undefined {
  if (!raw) return undefined;

  return {
    name: typeof raw.virtualserver_name === "string"
      ? raw.virtualserver_name
      : undefined,
    platform: typeof raw.virtualserver_platform === "string"
      ? raw.virtualserver_platform
      : undefined,
    version: typeof raw.virtualserver_version === "string"
      ? raw.virtualserver_version
      : undefined,
    uptimeSeconds: safeNumber(raw.virtualserver_uptime),
    maxClients: safeNumber(raw.virtualserver_maxclients),
    totalClients: Math.max(
      0,
      (safeNumber(raw.virtualserver_clientsonline) ?? 0) - 1,
    ),
    totalChannels: safeNumber(raw.virtualserver_channelsonline),
    defaultChannelGroupId: safeNumber(raw.virtualserver_default_channel_group),
  };
}

function safeNumber(value: unknown): number | undefined {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function flagTrue(value: unknown): boolean {
  return String(value) === "1";
}

// node-ts turns anything that looks like an integer into a number, so a
// description of "1337" arrives as one.
function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

type GroupRecord = {
  sgid?: number | string;
  cgid?: number | string;
  name?: string;
  type?: number | string;
};

// clientinfo also returns connection_client_ip. Only the fields named here
// make it into the snapshot, which is public.
type ClientInfoRecord = {
  client_description?: string | number;
  client_totalconnections?: number | string;
  connection_connected_time?: number | string;
  client_flag_avatar?: string | number;
  client_base64HashClientUID?: string;
};

type FileTransferRecord = {
  ftkey?: string;
  port?: number | string;
  size?: number | string;
  ip?: string;
  status?: number | string;
  msg?: string;
};

type TeamSpeakClientEntry = {
  clid?: number | string;
  client_unique_identifier?: string;
  client_nickname?: string;
  client_database_id?: number | string;
  cid?: number | string;
  client_type?: number | string;
  client_servergroups?: string;
  client_channel_group_id?: number | string;
  client_away?: string;
  client_input_muted?: string;
  client_output_muted?: string;
  client_talk_power?: string;
  client_talk_request?: string;
  client_idle_time?: number | string;
  client_version?: string;
  client_platform?: string;
  client_country?: string;
  client_created?: number | string;
  client_lastconnected?: number | string;
};
