import { getPublishableKey, getSecretKey } from "../_shared/env.ts";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "database-types";
import { corsHeaders } from "../_shared/cors.ts";
import { getAuthenticatedUserId } from "../_shared/auth.ts";

const RATE_LIMIT_SECONDS = 60;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: "Missing authorization" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = getPublishableKey();

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const auth = await getAuthenticatedUserId(supabase, authHeader);
    if ("response" in auth) return auth.response;
    const user = { id: auth.userId };

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("steam_id, rich_presence_enabled")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Failed to fetch profile",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!profile.rich_presence_enabled) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Rich presence is not enabled",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!profile.steam_id) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "No Steam account linked",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: presence } = await supabase
      .from("presences_steam")
      .select("fetched_at")
      .eq("profile_id", user.id)
      .single();

    if (presence?.fetched_at) {
      const lastRefresh = new Date(presence.fetched_at);
      const secondsSinceRefresh = (Date.now() - lastRefresh.getTime()) / 1000;

      if (secondsSinceRefresh < RATE_LIMIT_SECONDS) {
        const waitSeconds = Math.ceil(RATE_LIMIT_SECONDS - secondsSinceRefresh);
        return new Response(
          JSON.stringify({
            success: false,
            message:
              `Please wait ${waitSeconds} seconds before refreshing again`,
            retry_after: waitSeconds,
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "Retry-After": String(waitSeconds),
            },
          },
        );
      }
    }

    // Service role client for the queue
    const serviceRoleKey = getSecretKey();
    if (!serviceRoleKey) {
      throw new Error("Missing service role key");
    }

    const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey);

    const { error: queueError } = await adminClient.rpc("pgmq_send", {
      queue_name: "queue_sync_steam",
      msg: {
        profile_id: user.id,
        steam_id: profile.steam_id,
      },
    });

    if (queueError) {
      console.error("Failed to enqueue sync job:", queueError);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Failed to queue refresh",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Stamp fetched_at now so the rate limit covers the queued job
    await adminClient
      .from("presences_steam")
      .upsert(
        {
          profile_id: user.id,
          fetched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" },
      );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Steam refresh queued",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
