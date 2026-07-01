/**
 * Shared Last.fm API helpers
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LastfmTrack {
  /** Track title */
  name: string;
  /** Artist name */
  artist: string;
  /** Album name (may be empty string) */
  album: string;
  /** Last.fm track page URL */
  url: string;
  /** True when the track is currently playing (no timestamp yet) */
  nowPlaying: boolean;
  /** Unix timestamp of when the track finished (null when now-playing) */
  playedAt: Date | null;
}

/** Raw shape returned by user.getRecentTracks for a single track entry */
interface RawTrack {
  name: string;
  artist: { "#text": string };
  album: { "#text": string };
  url: string;
  "@attr"?: { nowplaying?: string };
  date?: { uts: string };
}

/** Raw shape returned by user.getRecentTracks */
interface RecentTracksResponse {
  recenttracks?: {
    track?: RawTrack | RawTrack[];
  };
  error?: number;
  message?: string;
}

/** Raw shape returned by auth.getSession */
interface GetSessionResponse {
  session?: {
    name: string;
    key: string;
    subscriber: number;
  };
  error?: number;
  message?: string;
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/**
 * Compute the Last.fm `api_sig` for a set of parameters.
 *
 * Algorithm: sort keys alphabetically, concatenate `key + value` for each
 * pair (excluding `format` and `callback`), append the shared secret, then
 * return the hex-encoded MD5 digest.
 */
export function signParams(
  params: Record<string, string>,
  secret: string,
): string {
  const sorted = Object.keys(params)
    .filter((k) => k !== "format" && k !== "callback")
    .sort();

  let raw = "";
  for (const key of sorted) {
    raw += key + params[key];
  }
  raw += secret;

  return createHash("md5").update(raw, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

const LASTFM_API_ROOT = "https://ws.audioscrobbler.com/2.0/";

/**
 * Exchange a Last.fm auth token for a session, returning just the username.
 * Does NOT store the session key - we only care about the username.
 */
export async function fetchLastfmAuthSession(
  token: string,
  apiKey: string,
  secret: string,
): Promise<{ name: string }> {
  const params: Record<string, string> = {
    method: "auth.getSession",
    api_key: apiKey,
    token,
  };

  const apiSig = signParams(params, secret);
  const url = new URL(LASTFM_API_ROOT);
  url.searchParams.set("method", params.method);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("token", token);
  url.searchParams.set("api_sig", apiSig);
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString());
  const data = (await res.json()) as GetSessionResponse;

  if (data.error || !data.session) {
    throw new Error(
      `Last.fm auth.getSession error ${data.error ?? "unknown"}: ${
        data.message ?? "no session returned"
      }`,
    );
  }

  return { name: data.session.name };
}

/**
 * Fetch the most recent track for a Last.fm user.
 * Returns null when the user has no scrobbles or the request fails.
 */
export async function fetchRecentTrack(
  username: string,
  apiKey: string,
): Promise<LastfmTrack | null> {
  const url = new URL(LASTFM_API_ROOT);
  url.searchParams.set("method", "user.getRecentTracks");
  url.searchParams.set("user", username);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString());

  if (!res.ok) {
    console.error(`Last.fm user.getRecentTracks HTTP ${res.status}`);
    return null;
  }

  const data = (await res.json()) as RecentTracksResponse;

  if (data.error) {
    console.error(
      `Last.fm user.getRecentTracks error ${data.error}: ${data.message}`,
    );
    return null;
  }

  const trackData = data.recenttracks?.track;
  if (!trackData) return null;

  // The API returns an array, but collapses to an object when there is only 1 result
  const track: RawTrack = Array.isArray(trackData) ? trackData[0] : trackData;

  if (!track) return null;

  const nowPlaying = track["@attr"]?.nowplaying === "true";
  const playedAt = !nowPlaying && track.date?.uts
    ? new Date(parseInt(track.date.uts, 10) * 1000)
    : null;

  return {
    name: track.name,
    artist: track.artist["#text"],
    album: track.album["#text"],
    url: track.url,
    nowPlaying,
    playedAt,
  };
}

// ---------------------------------------------------------------------------
// Album art resolution
// ---------------------------------------------------------------------------

/**
 * Attempt to resolve a high-resolution album art URL.
 * Tries Deezer first (no API key needed), falls back to iTunes.
 * Returns null when neither source has a result.
 */
export async function resolveAlbumArt(
  artist: string,
  track: string,
): Promise<string | null> {
  // --- Deezer: precise query first ---
  const preciseDeezerQuery = encodeURIComponent(
    `track:"${track}" artist:"${artist}"`,
  );
  const deezerPrecise = await fetchDeezerCover(
    `https://api.deezer.com/search?q=${preciseDeezerQuery}&limit=1`,
  );
  if (deezerPrecise) return deezerPrecise;

  // --- Deezer: loose fallback ---
  const looseDeezerQuery = encodeURIComponent(`${artist} ${track}`);
  const deezerLoose = await fetchDeezerCover(
    `https://api.deezer.com/search?q=${looseDeezerQuery}&limit=1`,
  );
  if (deezerLoose) return deezerLoose;

  // --- iTunes fallback ---
  const itunesQuery = encodeURIComponent(`${artist} ${track}`);
  const itunesUrl =
    `https://itunes.apple.com/search?term=${itunesQuery}&entity=song&limit=1`;

  try {
    const res = await fetch(itunesUrl);
    if (res.ok) {
      const data = (await res.json()) as {
        results?: { artworkUrl100?: string }[];
      };
      const artwork = data.results?.[0]?.artworkUrl100;
      if (artwork) {
        return artwork.replace("100x100bb", "600x600bb");
      }
    }
  } catch (err) {
    console.warn("iTunes album art lookup failed:", err);
  }

  return null;
}

async function fetchDeezerCover(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: { album?: { cover_xl?: string } }[];
    };
    return data.data?.[0]?.album?.cover_xl ?? null;
  } catch (err) {
    console.warn("Deezer album art lookup failed:", err);
    return null;
  }
}
