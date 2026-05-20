import { createClient } from "@supabase/supabase-js";
import type { Database } from "database-types";
import { corsHeaders } from "../_shared/cors.ts";
import { fetchLastfmAuthSession } from "../_shared/lastfm.ts";

/**
 * Last.fm authentication verify endpoint
 * Exchanges the Last.fm `token` (from the callback URL) for the username,
 * then writes `lastfm_username` to the authenticated user's profile.
 *
 * POST body:
 * - token: string  (the `token` query param from the Last.fm callback)
 * - state: string  (the base64-encoded state param, unused server-side but accepted for symmetry)
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
        JSON.stringify({ success: false, error: "Missing authorization" }),
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
        JSON.stringify({ success: false, error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

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

    // Exchange the token for a session - we only need the username (name)
    const session = await fetchLastfmAuthSession(token, apiKey, sharedSecret);
    const lastfmUsername = session.name;

    // Write the username to the user's profile using the service role client
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_KEY") ?? "";
    const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey);

    // lastfm_username is a new column not yet in the generated types;
    // cast through `never` until the migration is applied and types regenerated.
    // deno-lint-ignore no-explicit-any
    const adminClientAny = adminClient as ReturnType<typeof createClient<any>>;
    const { error: updateError } = await adminClientAny
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
