import * as constants from "constants" with { type: "json" };
import { createClient, type User } from "@supabase/supabase-js";
import type { Database, Tables } from "database-types";
import { TeamSpeakClient } from "node-ts/lib/node-ts.js";
import { corsHeaders } from "../_shared/cors.ts";
import {
  createPrivateServiceRoleClient,
  createPublicServiceRoleClient,
  type PrivateServiceClient,
  type PublicServiceClient,
} from "../_shared/serviceRoleClients.ts";
import { parseEnvMap } from "../_shared/env.ts";

interface RequestPayload {
  uniqueId?: string;
  token?: string;
  serverId?: string;
}

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
  roleLifetimeSupporterGroupId?: number;
}

interface CredentialsMap {
  usernames: Map<string, string>;
  passwords: Map<string, string>;
}

const TEAMSPEAK_TIMEOUT_MS = 15_000;
const TOKEN_LENGTH = 8;
const TOKEN_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const appConstants = constants.default;

interface TeamSpeakPlatformConfig {
  servers?: TeamSpeakServerDefinition[];
}

const teamSpeakPlatform = (appConstants?.PLATFORMS?.TEAMSPEAK ?? {}) as TeamSpeakPlatformConfig;

const availableServers = Array.isArray(teamSpeakPlatform.servers)
  ? teamSpeakPlatform.servers as TeamSpeakServerDefinition[]
  : [];

const credentials: CredentialsMap = {
  usernames: parseEnvMap(Deno.env.get("TEAMSPEAK_QUERY_USERNAMES")),
  passwords: parseEnvMap(Deno.env.get("TEAMSPEAK_QUERY_PASSWORDS")),
};

type ProfileRecord = Pick<
  Tables<"profiles">,
  "id" | "username" | "banned" | "supporter_patreon" | "supporter_lifetime" | "teamspeak_identities"
>;
type IdentityRecord = ProfileRecord["teamspeak_identities"][number];
type TokenRecord = Database["private"]["Tables"]["teamspeak_tokens"]["Row"];
type RoleRecord = Tables<"user_roles">;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function sanitizeUniqueId(value?: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "uniqueId is required");
  }

  const trimmed = value.trim();
  if (trimmed.length < 5) {
    throw new HttpError(400, "uniqueId appears to be invalid");
  }

  return trimmed;
}

function sanitizeToken(value?: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "token is required");
  }

  const normalized = value.trim().replace(/\s+/g, "").toUpperCase();
  if (normalized.length !== TOKEN_LENGTH) {
    throw new HttpError(400, "token appears to be invalid");
  }

  for (const char of normalized) {
    if (!TOKEN_ALPHABET.includes(char)) {
      throw new HttpError(400, "token contains invalid characters");
    }
  }

  return normalized;
}

async function requireAuthenticatedUser(req: Request): Promise<User> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new HttpError(401, "Authentication required");
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw new HttpError(401, "Authentication required");
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: {
        headers: { Authorization: authHeader },
      },
    },
  );

  const { data, error } = await supabaseClient.auth.getUser(token);
  if (error || !data?.user) {
    console.warn("TeamSpeak confirm auth failed", error);
    throw new HttpError(401, "Authentication required");
  }

  return data.user;
}

async function fetchProfile(client: PublicServiceClient, userId: string): Promise<ProfileRecord | null> {
  const { data, error } = await client
    .from("profiles")
    .select("id, username, banned, supporter_patreon, supporter_lifetime, teamspeak_identities")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch profile", error);
    throw new HttpError(500, "Unable to load profile for verification");
  }

  return data ?? null;
}

async function fetchUserRole(client: PublicServiceClient, userId: string): Promise<RoleRecord["role"] | null> {
  const { data, error } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch user role", error);
    throw new HttpError(500, "Unable to determine user role for TeamSpeak provisioning");
  }

  return data?.role ?? null;
}

async function fetchVerificationToken(args: {
  client: PrivateServiceClient;
  token: string;
  userId: string;
  uniqueId: string;
  serverId: string;
}): Promise<TokenRecord | null> {
  const tokenHash = await hashToken(args.token);
  const { data, error } = await args.client
    .from("teamspeak_tokens")
    .select("token_hash, user_id, unique_id, server_id, expires_at, created_at, attempts")
    .eq("token_hash", tokenHash)
    .eq("user_id", args.userId)
    .eq("unique_id", args.uniqueId)
    .eq("server_id", args.serverId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch verification token", error);
    throw new HttpError(500, "Unable to validate verification token");
  }

  if (!data) {
    return null;
  }

  return data as TokenRecord;
}

async function deleteTokenByHash(client: PrivateServiceClient, tokenHash: string): Promise<void> {
  const { error } = await client
    .from("teamspeak_tokens")
    .delete()
    .eq("token_hash", tokenHash);

  if (error) {
    console.warn("Failed to delete consumed TeamSpeak verification token", error);
  }
}

function upsertIdentity(existing: IdentityRecord[], next: IdentityRecord): IdentityRecord[] {
  const filtered = existing.filter((identity) =>
    !(identity.serverId === next.serverId && identity.uniqueId === next.uniqueId)
  );
  return [...filtered, next];
}

async function updateProfileIdentities(client: PublicServiceClient, userId: string, identities: IdentityRecord[]) {
  const { error } = await client
    .from("profiles")
    .update({ teamspeak_identities: identities })
    .eq("id", userId);

  if (error) {
    console.error("Failed to update TeamSpeak identities", error);
    throw new HttpError(500, "Unable to update TeamSpeak identities on profile");
  }
}

async function assignServerGroups(args: {
  server: TeamSpeakServerDefinition;
  uniqueId: string;
  profile: ProfileRecord;
  role: RoleRecord["role"] | null;
}): Promise<number[]> {
  const username = credentials.usernames.get(args.server.id);
  const password = credentials.passwords.get(args.server.id);

  if (!username || !password) {
    throw new HttpError(500, `Missing TeamSpeak credentials for server "${args.server.id}"`);
  }

  const client = new TeamSpeakClient(args.server.queryHost, args.server.queryPort ?? 10011);
  const targetGroups = computeTargetGroupIds(args.server, args.profile, args.role);

  if (!targetGroups.length) {
    return [];
  }

  try {
    await client.connect();
    client.setTimeout(TEAMSPEAK_TIMEOUT_MS);

    await client.send("login", {
      client_login_name: username,
      client_login_password: password,
    });

    if (typeof args.server.virtualServerId === "number") {
      await client.send("use", { sid: args.server.virtualServerId });
    } else if (typeof args.server.voicePort === "number") {
      await sendRawCommand(client, "use", { port: args.server.voicePort });
    } else {
      throw new HttpError(500, `Server "${args.server.id}" is missing routing information`);
    }

    const dbLookup = await sendRawCommand(client, "clientgetdbidfromuid", { cluid: args.uniqueId }) as {
      response?: Array<{ cldbid?: number | string }>;
    };
    const record = dbLookup.response?.[0];

    if (!record?.cldbid) {
      throw new HttpError(404, "Client database record was not found for the supplied uniqueId", {
        uniqueId: args.uniqueId,
      });
    }

    const clientDbId = Number(record.cldbid);
    if (!Number.isFinite(clientDbId)) {
      throw new HttpError(500, "TeamSpeak returned an invalid database identifier");
    }

    for (const groupId of targetGroups) {
      try {
        await sendRawCommand(client, "servergroupaddclient", { sgid: groupId, cldbid: clientDbId });
      } catch (error) {
        if (isAlreadyAssignedError(error)) {
          continue;
        }
        throw error;
      }
    }

    return targetGroups;
  } finally {
    await shutdownClient(client);
  }
}

function computeTargetGroupIds(
  server: TeamSpeakServerDefinition,
  profile: ProfileRecord,
  role: RoleRecord["role"] | null,
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

function isAlreadyAssignedError(error: unknown): boolean {
  if (!error) return false;

  if (typeof error === "object" && error !== null) {
    const typed = error as { error?: { id?: number; msg?: string }; message?: string };
    if (typed.error?.id === 2561) return true; // duplicate entry
    if (typed.error?.id === 2568) return true; // already in server group
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

async function hashToken(token: string): Promise<string> {
  const payload = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function resolveServer(preferredId?: string): TeamSpeakServerDefinition {
  if (!availableServers.length) {
    throw new HttpError(500, "No TeamSpeak servers configured");
  }

  if (!preferredId) {
    return availableServers[0];
  }

  const match = availableServers.find((server) => server.id === preferredId);
  if (!match) {
    throw new HttpError(400, `Unknown serverId "${preferredId}"`);
  }

  return match;
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
): Promise<unknown> {
  const untypedClient = client as unknown as {
    send: (command: string, commandParams?: Record<string, unknown>) => Promise<unknown>;
  };

  return untypedClient.send(cmd, params);
}

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  let payload: RequestPayload;
  try {
    payload = await req.json();
  } catch (error) {
    console.error("Failed to parse JSON payload", error);
    return jsonResponse(400, { error: "Invalid JSON payload" });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const uniqueId = sanitizeUniqueId(payload.uniqueId);
    const token = sanitizeToken(payload.token);
    const server = resolveServer(payload.serverId);
    const supabaseAdmin = createPublicServiceRoleClient();
    const supabasePrivate = createPrivateServiceRoleClient();
    const profile = await fetchProfile(supabaseAdmin, user.id);

    if (!profile) {
      throw new HttpError(404, "Profile not found for the authenticated user");
    }

    const tokenRecord = await fetchVerificationToken({
      client: supabasePrivate,
      token,
      userId: user.id,
      uniqueId,
      serverId: server.id,
    });

    if (!tokenRecord) {
      throw new HttpError(400, "Invalid or expired verification token");
    }

    const now = Date.now();
    if (new Date(tokenRecord.expires_at).getTime() < now) {
      await deleteTokenByHash(supabasePrivate, tokenRecord.token_hash);
      throw new HttpError(400, "Verification token has expired. Please request a new one.");
    }

    await deleteTokenByHash(supabasePrivate, tokenRecord.token_hash);

    const identityEntry: IdentityRecord = {
      serverId: server.id,
      uniqueId,
      linkedAt: new Date().toISOString(),
    };

    const updatedIdentities = upsertIdentity(profile.teamspeak_identities ?? [], identityEntry);

    await updateProfileIdentities(supabaseAdmin, user.id, updatedIdentities);

    let assignmentSkippedReason: string | undefined;
    let assignedGroups: number[] = [];

    if (profile.banned) {
      assignmentSkippedReason = "banned";
    } else {
      const role = await fetchUserRole(supabaseAdmin, user.id);
      assignedGroups = await assignServerGroups({
        server,
        uniqueId,
        profile,
        role,
      });
    }

    return jsonResponse(200, {
      status: "confirmed",
      serverId: server.id,
      uniqueId,
      identities: updatedIdentities,
      groupsAssigned: assignedGroups,
      assignmentSkippedReason,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(error.status, { error: error.message, details: error.details });
    }

    console.error("Unhandled TeamSpeak confirmation error", error);
    return jsonResponse(502, { error: "Failed to confirm TeamSpeak identity" });
  }
});
