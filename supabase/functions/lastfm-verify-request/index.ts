import { getPublishableKey } from "../_shared/env.ts";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "database-types";
import { corsHeaders } from "../_shared/cors.ts";
import { getAuthenticatedUserId } from "../_shared/auth.ts";

/**
 * Link-only, so the caller must be signed in.
 * POST { baseUrl, redirect? }. redirect defaults to /profile/settings.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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
    const supabaseAnonKey = getPublishableKey();

    const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const auth = await getAuthenticatedUserId(supabase, authHeader);
    if ("response" in auth) return auth.response;

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

    const state = btoa(JSON.stringify({ redirect }));
    const returnUrl = `${baseUrl}/auth/callback/lastfm?state=${
      encodeURIComponent(state)
    }`;

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
