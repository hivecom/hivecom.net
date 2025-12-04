import * as constants from "app-constants" with { type: "json" };
import { createClient, type User } from "@supabase/supabase-js";
import {
  TeamSpeakClient,
  TextMessageTargetMode,
} from "node-ts/lib/node-ts.js";
import { corsHeaders } from "../_shared/cors.ts";

interface RequestPayload {
  uniqueId?: string;
  message?: string;
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
}

interface CredentialsMap {
  usernames: Map<string, string>;
  passwords: Map<string, string>;
}

const MESSAGE_MAX_LENGTH = 512;
const TEAMSPEAK_TIMEOUT_MS = 15_000;

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
    const message = sanitizeMessage(payload.message);
    const server = resolveServer(payload.serverId);
    const username = credentials.usernames.get(server.id);
    const password = credentials.passwords.get(server.id);

    if (!username || !password) {
      throw new HttpError(500, `Missing TeamSpeak credentials for server "${server.id}"`);
    }

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

function sanitizeMessage(value?: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "message is required");
  }

  const normalized = value.trim();
  if (normalized.length > MESSAGE_MAX_LENGTH) {
    return normalized.slice(0, MESSAGE_MAX_LENGTH);
  }
  return normalized;
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

    if (args.server.botNickname) {
      await sendRawCommand(client, "clientupdate", {
        client_nickname: buildUniqueNickname(args.server.botNickname),
      });
    }

    const lookup = await sendRawCommand(client, "clientgetids", { cluid: args.uniqueId }) as {
      response?: Array<{ clid?: number | string }>;
    };
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
    await client.send("logout");
  } catch (error) {
    console.warn("Failed to logout from TeamSpeak", error);
  }

  try {
    await sendRawCommand(client, "quit");
  } catch (_) {
    // The server closes the socket immediately after quit; ignore errors here.
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

function parseEnvMap(input?: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!input) return map;

  for (const entry of input.split(",")) {
    const [rawKey, rawValue] = entry.split(":");
    const key = rawKey?.trim();
    const value = rawValue?.trim();
    if (!key || !value) continue;
    map.set(key, value);
  }

  return map;
}

function buildUniqueNickname(base: string): string {
  const trimmed = base.trim();
  const suffix = Math.floor(Math.random() * 9000 + 1000).toString();
  return `${trimmed} #${suffix}`;
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
