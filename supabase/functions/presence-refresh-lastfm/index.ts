import { createClient } from "@supabase/supabase-js";
import type { Database } from "database-types";
import { corsHeaders } from "../_shared/cors.ts";
import { fetchRecentTrack, resolveAlbumArt } from "../_shared/lastfm.ts";

// Convenience alias - used for queries against tables/columns not yet in
// the generated types (presences_lastfm, profiles.lastfm_username).
// Remove this alias once the migration has been applied and types regenerated.
// deno-lint-ignore no-explicit-any
type AnyClient = ReturnType<typeof createClient<any>>;

// Rate limit: one refresh per 1 minute per user
const RATE_LIMIT_SECONDS = 60;

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
        JSON.stringify({ success: false, message: "Missing authorization" }),
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
        JSON.stringify({ success: false, message: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const apiKey = Deno.env.get("LASTFM_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "LASTFM_API_KEY not configured",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch profile - check lastfm_username and rich_presence_enabled.
    // Cast to AnyClient because lastfm_username is not yet in the generated types.
    const { data: profile, error: profileError } = await (supabase as AnyClient)
      .from("profiles")
      .select("lastfm_username, rich_presence_enabled")
      .eq("id", user.id)
      .single() as {
        data:
          | { lastfm_username: string | null; rich_presence_enabled: boolean }
          | null;
        error: { message: string } | null;
      };

    if (profileError) {
      return new Response(
        JSON.stringify({ success: false, message: "Failed to fetch profile" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!profile.rich_presence_enabled || !profile.lastfm_username) {
      return new Response(
        JSON.stringify({ skipped: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const lastfmUsername = profile.lastfm_username;

    // Check rate limit - use AnyClient since presences_lastfm is not yet in types.
    const anySupabase = supabase as AnyClient;
    const { data: existing } = await anySupabase
      .from("presences_lastfm")
      .select("updated_at")
      .eq("profile_id", user.id)
      .single() as { data: { updated_at: string } | null };

    if (existing?.updated_at) {
      const secondsSince =
        (Date.now() - new Date(existing.updated_at).getTime()) / 1000;
      if (secondsSince < RATE_LIMIT_SECONDS) {
        const waitSeconds = Math.ceil(RATE_LIMIT_SECONDS - secondsSince);
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

    // Fetch from Last.fm
    const track = await fetchRecentTrack(lastfmUsername, apiKey);

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_KEY") ?? "";
    const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey);
    // Use untyped alias for presences_lastfm writes (table not yet in generated types).
    const anyAdminClient = adminClient as AnyClient;

    const now = new Date().toISOString();

    if (!track) {
      // Upsert with no track data - still record the refresh attempt
      await anyAdminClient
        .from("presences_lastfm")
        .upsert(
          {
            profile_id: user.id,
            lastfm_username: lastfmUsername,
            now_playing: false,
            track_name: null,
            artist_name: null,
            album_name: null,
            album_art_url: null,
            track_url: null,
            played_at: null,
            updated_at: now,
          },
          { onConflict: "profile_id" },
        );

      return new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Resolve album art in parallel with nothing else to wait on
    const albumArtUrl = await resolveAlbumArt(track.artist, track.name);

    const { error: upsertError } = await anyAdminClient
      .from("presences_lastfm")
      .upsert(
        {
          profile_id: user.id,
          lastfm_username: lastfmUsername,
          now_playing: track.nowPlaying,
          track_name: track.name,
          artist_name: track.artist,
          album_name: track.album || null,
          album_art_url: albumArtUrl,
          track_url: track.url,
          played_at: track.playedAt?.toISOString() ?? null,
          updated_at: now,
        },
        { onConflict: "profile_id" },
      );

    if (upsertError) {
      console.error("Failed to upsert Last.fm presence:", upsertError.message);
      throw upsertError;
    }

    console.log(
      `Refreshed Last.fm presence for ${user.id}: ${
        track.nowPlaying ? "now playing" : "last played"
      } "${track.name}" by ${track.artist}`,
    );

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Last.fm presence refresh error:", error);
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
