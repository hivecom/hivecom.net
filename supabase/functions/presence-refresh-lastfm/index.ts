import { getPublishableKey, getSecretKey } from "../_shared/env.ts";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "database-types";
import { corsHeaders } from "../_shared/cors.ts";
import { getAuthenticatedUserId } from "../_shared/auth.ts";
import { fetchRecentTrack, resolveAlbumArt } from "../_shared/lastfm.ts";

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = getPublishableKey();

    const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const auth = await getAuthenticatedUserId(supabase, authHeader);
    if ("response" in auth) return auth.response;
    const user = { id: auth.userId };

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

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("lastfm_username, rich_presence_enabled")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
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

    // Rate limit
    const { data: existing } = await supabase
      .from("presences_lastfm")
      .select("updated_at")
      .eq("profile_id", user.id)
      .maybeSingle();

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

    const track = await fetchRecentTrack(lastfmUsername, apiKey);

    const serviceRoleKey = getSecretKey();
    const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey);

    const now = new Date().toISOString();

    if (!track) {
      // Record the attempt anyway so the rate limit still applies
      await adminClient
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

    const albumArtUrl = await resolveAlbumArt(track.artist, track.name);

    const { error: upsertError } = await adminClient
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
