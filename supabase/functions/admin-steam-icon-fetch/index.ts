import { corsHeaders } from "../_shared/cors.ts";
import { authorizeAuthenticatedHasPermissionAal2 } from "../_shared/auth.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";

const STEAM_API_KEY = Deno.env.get("STEAM_API_KEY") ?? "";
// A public Steam account with a large game library used to resolve icon hashes.
// Set STEAM_ICON_ACCOUNT_ID in your Supabase secrets.
const STEAM_ICON_ACCOUNT_ID = Deno.env.get("STEAM_ICON_ACCOUNT_ID") ?? "";

const OWNED_GAMES_URL =
  "https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return responseMethodNotAllowed(req.method);
  }

  const authResponse = await authorizeAuthenticatedHasPermissionAal2(req, [
    "games.read",
  ]);
  if (authResponse) return authResponse;

  const url = new URL(req.url);
  const appId = url.searchParams.get("app_id");

  if (!appId || !/^\d+$/.test(appId)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Missing or invalid app_id",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }

  if (!STEAM_API_KEY) {
    console.error("STEAM_API_KEY not configured");
    return new Response(
      JSON.stringify({ success: false, error: "Steam API key not configured" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }

  if (!STEAM_ICON_ACCOUNT_ID) {
    console.error("STEAM_ICON_ACCOUNT_ID not configured");
    return new Response(
      JSON.stringify({
        success: false,
        error: "Steam icon account not configured",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }

  try {
    const params = new URLSearchParams({
      key: STEAM_API_KEY,
      steamid: STEAM_ICON_ACCOUNT_ID,
      format: "json",
      include_appinfo: "1",
      include_played_free_games: "1",
      skip_unvetted_apps: "false",
    });

    const res = await fetch(`${OWNED_GAMES_URL}?${params.toString()}`);

    if (!res.ok) {
      console.error("Steam API error:", res.status, res.statusText);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to reach Steam API" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 502,
        },
      );
    }

    const data = await res.json();
    const games: Array<{ appid: number; img_icon_url: string }> =
      data?.response?.games ?? [];

    const match = games.find((g) => String(g.appid) === appId);

    if (!match || !match.img_icon_url) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Icon hash not found for this app_id in the configured Steam account's library",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        },
      );
    }

    const iconUrl =
      `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${match.img_icon_url}.jpg`;

    // If download=1, proxy the image bytes directly (avoids browser CORS on fetch)
    const download = url.searchParams.get("download");
    if (download === "1") {
      const imgRes = await fetch(iconUrl);
      if (!imgRes.ok) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to fetch icon image",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 502,
          },
        );
      }
      const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
      return new Response(await imgRes.arrayBuffer(), {
        headers: { ...corsHeaders, "Content-Type": contentType },
        status: 200,
      });
    }

    return new Response(
      JSON.stringify({ success: true, app_id: appId, icon_url: iconUrl }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    const error = err as Error;
    console.error("Error in admin-steam-icon-fetch:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
