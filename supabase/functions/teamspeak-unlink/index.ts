import { createClient, type User } from "@supabase/supabase-js";
import type { Tables } from "database-types";
import { corsHeaders } from "../_shared/cors.ts";
import { createPublicServiceRoleClient, type PublicServiceClient } from "../_shared/serviceRoleClients.ts";

interface RequestPayload {
  uniqueId?: string;
  serverId?: string;
}

type ProfileRecord = Pick<Tables<"profiles">, "id" | "teamspeak_identities">;
type IdentityRecord = ProfileRecord["teamspeak_identities"][number];

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
    console.warn("TeamSpeak unlink auth failed", error);
    throw new HttpError(401, "Authentication required");
  }

  return data.user;
}

async function fetchProfile(client: PublicServiceClient, userId: string): Promise<ProfileRecord | null> {
  const { data, error } = await client
    .from("profiles")
    .select("id, teamspeak_identities")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch profile", error);
    throw new HttpError(500, "Unable to load profile for TeamSpeak unlink");
  }

  return data ?? null;
}

function sanitizeUniqueId(value?: string): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "uniqueId must be a non-empty string when provided");
  }

  const trimmed = value.trim();
  if (trimmed.length < 5) {
    throw new HttpError(400, "uniqueId appears to be invalid");
  }

  return trimmed;
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
    const targetUniqueId = sanitizeUniqueId(payload.uniqueId);
    const targetServerId = typeof payload.serverId === "string" ? payload.serverId.trim() : "";

    const supabaseAdmin = createPublicServiceRoleClient();
    const profile = await fetchProfile(supabaseAdmin, user.id);

    if (!profile) {
      throw new HttpError(404, "Profile not found for the authenticated user");
    }

    const existing: IdentityRecord[] = profile.teamspeak_identities ?? [];
    let removed: IdentityRecord[] = [];
    let updated: IdentityRecord[] = existing;

    if (!targetUniqueId) {
      // Remove all
      removed = existing;
      updated = [];
    } else {
      removed = existing.filter((identity: IdentityRecord) => {
        const matchesUniqueId = identity.uniqueId === targetUniqueId;
        const matchesServer = targetServerId ? identity.serverId === targetServerId : true;
        return matchesUniqueId && matchesServer;
      });

      if (!removed.length) {
        throw new HttpError(404, "No matching TeamSpeak identity found to unlink");
      }

      updated = existing.filter((identity: IdentityRecord) => {
        const matchesUniqueId = identity.uniqueId === targetUniqueId;
        const matchesServer = targetServerId ? identity.serverId === targetServerId : true;
        return !(matchesUniqueId && matchesServer);
      });
    }

    await updateProfileIdentities(supabaseAdmin, user.id, updated);

    return jsonResponse(200, {
      status: "unlinked",
      removedCount: removed.length,
      removed,
      identities: updated,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(error.status, { error: error.message, details: error.details });
    }

    console.error("Unhandled TeamSpeak unlink error", error);
    return jsonResponse(502, { error: "Failed to unlink TeamSpeak identity" });
  }
});
