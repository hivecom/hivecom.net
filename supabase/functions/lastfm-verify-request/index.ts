import { createClient } from "@supabase/supabase-js";
import type { Database } from "database-types";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Last.fm authentication start endpoint
 * Returns the Last.fm auth URL for the client to redirect to.
 * Link-only flow - requires an authenticated user.
 *
 * POST body:
 * - baseUrl: string  (origin of the frontend, e.g. https://hivecom.net)
 * - redirect?: string  (post-auth redirect path, default: /profile/settings)
 */
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Require authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const apiKey = Deno.env.get("LASTFM_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "LASTFM_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const body = await req.json() as { baseUrl?: string; redirect?: string };
    const { baseUrl, redirect = "/profile/settings" } = body;

    if (!baseUrl) {
      return new Response(
        JSON.stringify({ error: "baseUrl is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Build the callback URL that Last.fm will redirect back to
    const state = btoa(JSON.stringify({ redirect }));
    const returnUrl =
      `${baseUrl}/auth/callback/lastfm?state=${encodeURIComponent(state)}`;

    // Build the Last.fm auth URL
    const lastfmAuthUrl = new URL("https://www.last.fm/api/auth/");
    lastfmAuthUrl.searchParams.set("api_key", apiKey);
    lastfmAuthUrl.searchParams.set("cb", returnUrl);

    return new Response(
      JSON.stringify({ url: lastfmAuthUrl.toString() }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Last.fm auth start error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
