import { getPublishableKey, getSecretKey } from "../_shared/env.ts";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "database-types";
import { corsHeaders } from "../_shared/cors.ts";
import { getAuthenticatedUserId } from "../_shared/auth.ts";
import { fetchLastfmAuthSession } from "../_shared/lastfm.ts";

/**
 * Exchanges the Last.fm callback `token` for a username and links it to the
 * caller's profile. POST { token, state }. `state` is accepted but unused here.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization" }),
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
    const user = { id: auth.userId };

    const apiKey = Deno.env.get("LASTFM_API_KEY");
    const sharedSecret = Deno.env.get("LASTFM_SHARED_SECRET");

    if (!apiKey || !sharedSecret) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Last.fm credentials not configured",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const body = await req.json() as { token?: string; state?: string };
    const { token } = body;

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: "token is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const session = await fetchLastfmAuthSession(token, apiKey, sharedSecret);
    const lastfmUsername = session.name;

    // Service role write, so it has to stay scoped to the caller's own id
    const serviceRoleKey = getSecretKey();
    const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey);

    const { error: updateError } = await adminClient
      .from("profiles")
      .update({ lastfm_username: lastfmUsername })
      .eq("id", user.id);

    if (updateError) {
      if (updateError.code === "23505") {
        return new Response(
          JSON.stringify({
            success: false,
            error: "already_linked",
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      throw updateError;
    }

    console.log(
      `Linked Last.fm account "${lastfmUsername}" to user ${user.id}`,
    );

    return new Response(
      JSON.stringify({ success: true, lastfmUsername }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Last.fm auth verify error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
