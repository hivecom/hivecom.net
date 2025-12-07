import * as constants from "constants" with { type: "json" };
import { createClient, type User } from "@supabase/supabase-js";
import type { Tables } from "database-types";
import {
  TeamSpeakClient,
  TextMessageTargetMode,
} from "node-ts/lib/node-ts.js";
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

const MESSAGE_MAX_LENGTH = 512;
const TEAMSPEAK_TIMEOUT_MS = 15_000;
const TOKEN_LENGTH = 8;
const TOKEN_EXPIRATION_MINUTES = 15;
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

type ProfileRecord = Pick<Tables<"profiles">, "id" | "username" | "banned">;
type IdentityRecord = Tables<"profiles">["teamspeak_identities"][number];

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
    const server = resolveServer(payload.serverId);
    const supabaseAdmin = createPublicServiceRoleClient();
    const supabasePrivate = createPrivateServiceRoleClient();
    const profile = await fetchProfile(supabaseAdmin, user.id);

    if (!profile) {
      throw new HttpError(404, "Profile not found for the authenticated user");
    }

    if (profile.banned) {
      throw new HttpError(403, "Banned accounts cannot link TeamSpeak identities");
    }

    const existingIdentities = profile.teamspeak_identities ?? [];
    const isAlreadyLinked = existingIdentities.some((identity: IdentityRecord) =>
      identity.serverId === server.id && identity.uniqueId === uniqueId
    );

    if (isAlreadyLinked) {
      throw new HttpError(400, "This TeamSpeak identity is already linked to your account");
    }

    await ensureUniqueIdentity(supabaseAdmin, {
      uniqueId,
      serverId: server.id,
      userId: user.id,
    });

    const token = generateVerificationToken();
    const tokenHash = await hashToken(token);
    const tokenExpiresAt = new Date(Date.now() + TOKEN_EXPIRATION_MINUTES * 60_000).toISOString();
    const username = credentials.usernames.get(server.id);
    const password = credentials.passwords.get(server.id);

    if (!username || !password) {
      throw new HttpError(500, `Missing TeamSpeak credentials for server "${server.id}"`);
    }

    await persistVerificationToken({
      client: supabasePrivate,
      tokenHash,
      userId: user.id,
      serverId: server.id,
      uniqueId,
      expiresAt: tokenExpiresAt,
    });

    const message = buildVerificationMessage({
      username: profile.username,
      email: user.email,
      token,
    });

    const delivery = await sendTeamSpeakMessage({
      credentials: { username, password },
      message,
      uniqueId,
      server,
    });

    return jsonResponse(200, {
      status: "sent",
      serverId: server.id,
      clientId: delivery.clientId,
      uniqueId,
      requestedBy: user.id,
      tokenExpiresAt,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(error.status, { error: error.message, details: error.details });
    }

    console.error("Unhandled TeamSpeak messaging error", error);
    return jsonResponse(502, { error: "Failed to send TeamSpeak message" });
  }
});

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
    console.warn("TeamSpeak verify auth failed", error);
    throw new HttpError(401, "Authentication required");
  }

  return data.user;
}

async function fetchProfile(client: PublicServiceClient, userId: string): Promise<(ProfileRecord & { teamspeak_identities: IdentityRecord[] | null }) | null> {
  const { data, error } = await client
    .from("profiles")
    .select("id, username, banned, teamspeak_identities")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch profile", error);
    throw new HttpError(500, "Unable to load profile for verification");
  }

  return data as (ProfileRecord & { teamspeak_identities: IdentityRecord[] | null }) | null;
}

async function ensureUniqueIdentity(client: PublicServiceClient, args: { uniqueId: string; serverId: string; userId: string }) {
  const { data, error } = await client
    .from("profiles")
    .select("id, teamspeak_identities")
    .not("teamspeak_identities", "is", null);

  if (error) {
    console.error("Failed to check existing TeamSpeak identities", error);
    throw new HttpError(500, "Unable to validate TeamSpeak identity availability");
  }

  const records = (data ?? []) as Array<Pick<Tables<"profiles">, "id" | "teamspeak_identities">>;
  const conflict = records.find((record) => {
    const identities = record.teamspeak_identities ?? [];
    return identities.some((identity) => identity.serverId === args.serverId && identity.uniqueId === args.uniqueId);
  });

  if (conflict && conflict.id !== args.userId) {
    throw new HttpError(400, "This TeamSpeak identity is already linked to another account");
  }
}

async function persistVerificationToken(args: {
  client: PrivateServiceClient;
  tokenHash: string;
  userId: string;
  uniqueId: string;
  serverId: string;
  expiresAt: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();

  const { error: expiredCleanupError } = await args.client
    .from("teamspeak_tokens")
    .delete()
    .lt("expires_at", nowIso);

  if (expiredCleanupError) {
    console.warn("Failed to clean up expired TeamSpeak tokens", expiredCleanupError);
  }

  const { error: duplicateCleanupError } = await args.client
    .from("teamspeak_tokens")
    .delete()
    .eq("user_id", args.userId)
    .eq("server_id", args.serverId)
    .eq("unique_id", args.uniqueId);

  if (duplicateCleanupError) {
    console.warn("Failed to clean up previous TeamSpeak tokens", duplicateCleanupError);
  }

  const { error } = await args.client.from("teamspeak_tokens").insert({
    token_hash: args.tokenHash,
    user_id: args.userId,
    unique_id: args.uniqueId,
    server_id: args.serverId,
    expires_at: args.expiresAt,
  });

  if (error) {
    console.error("Failed to persist TeamSpeak verification token", error);
    throw new HttpError(500, "Unable to store verification token");
  }
}

function generateVerificationToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH));
  let token = "";
  for (const byte of bytes) {
    token += TOKEN_ALPHABET.charAt(byte % TOKEN_ALPHABET.length);
  }
  return token;
}

async function hashToken(token: string): Promise<string> {
  const payload = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buildVerificationMessage(args: {
  username: string;
  email?: string | null;
  token: string;
}): string {
  const lines = [
    `TeamSpeak verification for this identity was requested by ${args.username}${args.email ? ` (${args.email})` : '' }. Enter the following token in the next step of the linking process:`,
    `Token: ${args.token}`,
    `Enter this token on within ${TOKEN_EXPIRATION_MINUTES} minutes to finish linking. If you did not request this, contact an administrator.`,
  ];

  const message = lines.join("\n");
  return message.length > MESSAGE_MAX_LENGTH ? message.slice(0, MESSAGE_MAX_LENGTH) : message;
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

async function sendTeamSpeakMessage(args: {
  server: TeamSpeakServerDefinition;
  uniqueId: string;
  message: string;
  credentials: { username: string; password: string };
}): Promise<{ clientId: number }>
{
  const client = new TeamSpeakClient(args.server.queryHost, args.server.queryPort ?? 10011);

  try {
    await client.connect();
    client.setTimeout(TEAMSPEAK_TIMEOUT_MS);

    await client.send("login", {
      client_login_name: args.credentials.username,
      client_login_password: args.credentials.password,
    });

    if (typeof args.server.virtualServerId === "number") {
      await client.send("use", { sid: args.server.virtualServerId });
    } else if (typeof args.server.voicePort === "number") {
      await sendRawCommand(client, "use", { port: args.server.voicePort });
    } else {
      throw new HttpError(500, `Server "${args.server.id}" is missing routing information`);
    }

    let lookup;
    try {
      lookup = await sendRawCommand(client, "clientgetids", { cluid: args.uniqueId }) as {
        response?: Array<{ clid?: number | string }>;
        error?: { id?: number; msg?: string };
      };
    } catch (error) {
      const tsErrorId = (error as { error?: { id?: number } })?.error?.id ?? (error as { id?: number })?.id;
      if (tsErrorId === 1281) {
        throw new HttpError(404, "No TeamSpeak client found for that unique ID on this server", {
          uniqueId: args.uniqueId,
        });
      }
      throw error;
    }

    if (lookup?.error?.id === 1281) {
      throw new HttpError(404, "No TeamSpeak client found for that unique ID on this server", {
        uniqueId: args.uniqueId,
      });
    }

    const target = lookup.response?.[0];

    if (!target?.clid) {
      throw new HttpError(404, "Client is not currently online on the specified server", {
        uniqueId: args.uniqueId,
      });
    }

    const clientId = Number(target.clid);
    if (!Number.isFinite(clientId)) {
      throw new HttpError(500, "TeamSpeak returned an invalid client identifier");
    }

    await client.send("sendtextmessage", {
      targetmode: TextMessageTargetMode.CLIENT,
      target: clientId,
      msg: args.message,
    });

    return { clientId };
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

function sendRawCommand(
  client: TeamSpeakClient,
  cmd: string,
  params: Record<string, unknown> = {},
) : Promise<unknown> {
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
