import { createClient } from "@supabase/supabase-js";
import { authorizeSystemCron } from "../_shared/auth.ts";
import type { Database } from "database-types";
import {
  buildTeamSpeakCredentials,
  collectSnapshots,
  ensureTeamSpeakGroupAssignments,
  getTeamSpeakServers,
  loadTeamSpeakProfileMap,
  loadTeamSpeakRoleMap,
  SNAPSHOT_PATH,
  storeSnapshot,
  updatePresenceFromSnapshots,
} from "../_shared/teamspeak.ts";

const availableServers = getTeamSpeakServers();
const credentials = buildTeamSpeakCredentials(
  Deno.env.get("TEAMSPEAK_QUERY_USERNAMES"),
  Deno.env.get("TEAMSPEAK_QUERY_PASSWORDS"),
);

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

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const authResponse = authorizeSystemCron(req);
  if (authResponse) return authResponse;

  try {
    const snapshots = await collectSnapshots({
      servers: availableServers,
      credentials,
    });

    const profileMap = await loadTeamSpeakProfileMap(supabase);
    const roleMap = await loadTeamSpeakRoleMap(supabase);

    await ensureTeamSpeakGroupAssignments({
      snapshots,
      servers: availableServers,
      credentials,
      profileMap,
      roleMap,
    });
    await updatePresenceFromSnapshots({ supabase, snapshots, profileMap });

    const payload = {
      collectedAt: new Date().toISOString(),
      servers: snapshots,
    };

    await storeSnapshot(supabase, payload);

    return jsonResponse(200, { success: true, path: SNAPSHOT_PATH });
  } catch (error) {
    console.error("Error in cron-teamspeak-fetch", error);
    return jsonResponse(500, {
      success: false,
      error: "Failed to fetch TeamSpeak state",
    });
  }
});

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
