import { createClient } from "@supabase/supabase-js";
import { authorizeAuthenticated } from "../_shared/auth.ts";
import type { Database } from "database-types";
import {
  buildTeamSpeakCredentials,
  collectSnapshots,
  fetchSnapshotFromStorage,
  getTeamSpeakServers,
  isSnapshotFresh,
  storeSnapshot,
} from "../_shared/teamspeak.ts";
import { corsHeaders } from "../_shared/cors.ts";

const availableServers = getTeamSpeakServers();
const credentials = buildTeamSpeakCredentials(
  Deno.env.get("TEAMSPEAK_QUERY_VIEWER_USERNAMES"),
  Deno.env.get("TEAMSPEAK_QUERY_VIEWER_PASSWORDS"),
);

const CACHE_MAX_AGE_MS = 60_000;

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
    // This is needed if you're planning to invoke your function from a browser. Which we are.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authResponse = await authorizeAuthenticated(req);
  if (authResponse) return authResponse;

  try {
    const cached = await fetchSnapshotFromStorage(supabase);
    if (isSnapshotFresh(cached, CACHE_MAX_AGE_MS)) {
      if (cached === null) {
        return jsonResponse(500, {});
      } else {
        return jsonResponse(200, cached );
      }
    }

    const snapshots = await collectSnapshots({
      servers: availableServers,
      credentials,
    });

    const payload = {
      collectedAt: new Date().toISOString(),
      servers: snapshots,
    };

    await storeSnapshot(supabase, payload);

    return jsonResponse(200, payload);
  } catch (error) {
    console.error("Error in teamspeak-viewer-refresh", error);
    return jsonResponse(500, {});
  }
});

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
