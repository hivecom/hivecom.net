import { createClient } from "@supabase/supabase-js";
import type { Database } from "database-types";
import { corsHeaders } from "../_shared/cors.ts";

// Rate limit: one refresh per 1 minute per user
const RATE_LIMIT_SECONDS = 60;

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get the authorization header
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

    // Create Supabase client with user's auth
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get the authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, message: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get the user's profile to check if they have a Steam ID
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("steam_id")
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

    // Check rate limit - look at last refresh time
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
            message: `Please wait ${waitSeconds} seconds before refreshing again`,
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

    // Create service role client for queue operations
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceRoleKey) {
      throw new Error("Missing service role key");
    }

    const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey);

    // Enqueue the sync job for this user
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

    // Update fetched_at timestamp immediately to prevent rapid re-requests
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
