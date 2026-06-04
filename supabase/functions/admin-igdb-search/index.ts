import { corsHeaders } from "../_shared/cors.ts";
import { authorizeAuthenticatedHasPermissionAal2 } from "../_shared/auth.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";

const IGDB_CLIENT_ID = Deno.env.get("IGDB_CLIENT_ID") ?? "";
const IGDB_CLIENT_SECRET = Deno.env.get("IGDB_CLIENT_SECRET") ?? "";

const IGDB_BASE_URL = "https://api.igdb.com/v4/games";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const IGDB_IMAGE_BASE = "https://images.igdb.com/igdb/image/upload";

// Module-level token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();

  // Refresh if no token or within 60 seconds of expiry
  if (!cachedToken || cachedToken.expiresAt - now <= 60_000) {
    const params = new URLSearchParams({
      client_id: IGDB_CLIENT_ID,
      client_secret: IGDB_CLIENT_SECRET,
      grant_type: "client_credentials",
    });

    const res = await fetch(TWITCH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Twitch token error:", res.status, body);
      throw new Error("Failed to obtain Twitch access token");
    }

    const data = await res.json() as {
      access_token: string;
      expires_in: number;
    };
    cachedToken = {
      token: data.access_token,
      expiresAt: now + data.expires_in * 1000,
    };
  }

  return cachedToken.token;
}

async function igdbPost(query: string): Promise<unknown[]> {
  const token = await getAccessToken();

  const res = await fetch(IGDB_BASE_URL, {
    method: "POST",
    headers: {
      "Client-ID": IGDB_CLIENT_ID,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body: query,
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("IGDB API error:", res.status, body);
    throw new Error(`IGDB API error: ${res.status}`);
  }

  return await res.json() as unknown[];
}

// --- Response shape types ---

interface IgdbRawGame {
  id: number;
  name?: string;
  summary?: string;
  storyline?: string;
  first_release_date?: number;
  url?: string;
  cover?: { image_id: string };
  genres?: Array<{ name: string }>;
  themes?: Array<{ name: string }>;
  game_modes?: Array<{ name: string }>;
  multiplayer_modes?: Array<{
    offlinecoopmax?: number;
    onlinecoopmax?: number;
    onlinemax?: number;
  }>;
  external_games?: Array<{ uid?: string; url?: string }>;
  alternative_names?: Array<{ name?: string; comment?: string }>;
  websites?: Array<{ url: string; type: number }>;
  artworks?: Array<{ image_id: string }>;
  screenshots?: Array<{ image_id: string }>;
}

interface SearchResult {
  igdb_id: number;
  name: string;
  release_year: number | null;
  cover_url: string | null;
  summary: string | null;
  genre_names: string[];
}

interface GameDetails {
  igdb_id: number;
  igdb_url: string | null;
  name: string;
  summary: string | null;
  storyline: string | null;
  release_date: string | null;
  website: string | null;
  steam_id: string | null;
  acronym: string | null;
  genre_tags: string[];
  multiplayer_modes: string[];
  cover_url: string | null;
  background_url: string | null;
}

// --- Normalisation helpers ---

function coverUrl(imageId: string | undefined): string | null {
  if (!imageId) return null;
  return `${IGDB_IMAGE_BASE}/t_cover_big_2x/${imageId}.jpg`;
}

function backgroundUrl(game: IgdbRawGame): string | null {
  const imageId = game.artworks?.[0]?.image_id ??
    game.screenshots?.[0]?.image_id;
  if (!imageId) return null;
  return `${IGDB_IMAGE_BASE}/t_1080p/${imageId}.jpg`;
}

function releaseYear(timestamp: number | undefined): number | null {
  if (!timestamp) return null;
  return new Date(timestamp * 1000).getUTCFullYear();
}

function releaseDate(timestamp: number | undefined): string | null {
  if (!timestamp) return null;
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function officialWebsite(game: IgdbRawGame): string | null {
  const official = game.websites?.find((w) => w.type === 1);
  return official?.url ?? null;
}

function steamAppId(game: IgdbRawGame): string | null {
  const steam = game.external_games?.find((e) =>
    !!e.uid && /^\d+$/.test(e.uid) &&
    (e.url?.startsWith("https://store.steampowered.com/app/") ?? false)
  );
  return steam?.uid ?? null;
}

function acronym(game: IgdbRawGame): string | null {
  const entry = game.alternative_names?.find((a) =>
    a.comment?.toLowerCase() === "acronym" && !!a.name?.trim()
  );
  return entry?.name?.trim() ?? null;
}

function genreTags(game: IgdbRawGame): string[] {
  const raw = [
    ...(game.genres ?? []).map((g) => g.name),
    ...(game.themes ?? []).map((t) => t.name),
  ];
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const tag of raw) {
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(tag);
    }
  }
  return deduped.sort((a, b) => a.localeCompare(b));
}

function multiplayerModes(game: IgdbRawGame): string[] {
  const modes = new Set<string>();

  for (const gm of game.game_modes ?? []) {
    switch (gm.name) {
      case "Multiplayer":
        modes.add("pvp");
        break;
      case "Co-operative":
      case "Battle Royale":
        modes.add("coop");
        break;
      case "Massively Multiplayer Online (MMO)":
        modes.add("mmo");
        break;
      case "Single player":
        modes.add("singleplayer");
        break;
    }
  }

  for (const mm of game.multiplayer_modes ?? []) {
    if ((mm.offlinecoopmax ?? 0) > 0 || (mm.onlinecoopmax ?? 0) > 0) {
      modes.add("coop");
    }
    if ((mm.onlinemax ?? 0) > 1 && !modes.has("coop")) {
      modes.add("pvp");
    }
  }

  return Array.from(modes);
}

function normaliseSearchResult(raw: IgdbRawGame): SearchResult {
  return {
    igdb_id: raw.id,
    name: raw.name ?? "",
    release_year: releaseYear(raw.first_release_date),
    cover_url: coverUrl(raw.cover?.image_id),
    summary: raw.summary ?? null,
    genre_names: (raw.genres ?? []).map((g) => g.name),
  };
}

function normaliseDetails(raw: IgdbRawGame): GameDetails {
  return {
    igdb_id: raw.id,
    igdb_url: raw.url ?? null,
    name: raw.name ?? "",
    summary: raw.summary ?? null,
    storyline: raw.storyline ?? null,
    release_date: releaseDate(raw.first_release_date),
    website: officialWebsite(raw),
    steam_id: steamAppId(raw),
    acronym: acronym(raw),
    genre_tags: genreTags(raw),
    multiplayer_modes: multiplayerModes(raw),
    cover_url: coverUrl(raw.cover?.image_id),
    background_url: backgroundUrl(raw),
  };
}

// --- Handlers ---

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

async function handleSearch(params: URLSearchParams): Promise<Response> {
  const q = params.get("q");
  const steamId = params.get("steam_id");

  let query: string;

  if (q) {
    query = `search "${
      q.replace(/"/g, "")
    }"; fields id,name,first_release_date,cover.image_id,genres.name,summary; limit 10;`;
  } else if (steamId) {
    if (!/^\d+$/.test(steamId)) {
      return jsonResponse({ success: false, error: "Invalid steam_id" }, 400);
    }
    query =
      `fields id,name,first_release_date,cover.image_id,genres.name,summary; where external_games.uid = "${steamId}" & external_games.category = 1; limit 1;`;
  } else {
    return jsonResponse(
      { success: false, error: "mode=search requires either q or steam_id" },
      400,
    );
  }

  const raw = await igdbPost(query) as IgdbRawGame[];
  return jsonResponse({
    success: true,
    results: raw.map(normaliseSearchResult),
  });
}

async function handleDetails(params: URLSearchParams): Promise<Response> {
  const id = params.get("id");

  if (!id || !/^\d+$/.test(id)) {
    return jsonResponse({
      success: false,
      error: "mode=details requires a valid numeric id",
    }, 400);
  }

  const query =
    `fields id,name,summary,storyline,first_release_date,url,websites.url,websites.type,external_games.uid,external_games.url,alternative_names.name,alternative_names.comment,genres.name,themes.name,game_modes.name,multiplayer_modes.*,cover.image_id,artworks.image_id,screenshots.image_id; where id = ${id}; limit 1;`;

  const raw = await igdbPost(query) as IgdbRawGame[];

  if (!raw.length) {
    return jsonResponse({ success: false, error: "Game not found" }, 404);
  }

  return jsonResponse({ success: true, game: normaliseDetails(raw[0]) });
}

// --- Entry point ---

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

  if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
    console.error("IGDB_CLIENT_ID or IGDB_CLIENT_SECRET not configured");
    return jsonResponse({
      success: false,
      error: "IGDB credentials not configured",
    }, 500);
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode");

  try {
    if (mode === "search") {
      return await handleSearch(url.searchParams);
    } else if (mode === "details") {
      return await handleDetails(url.searchParams);
    } else {
      return jsonResponse(
        {
          success: false,
          error:
            "Missing or invalid mode param. Use mode=search or mode=details",
        },
        400,
      );
    }
  } catch (err) {
    const error = err as Error;
    console.error("Error in admin-igdb-search:", error);
    return jsonResponse(
      { success: false, error: "Internal server error" },
      500,
    );
  }
});
