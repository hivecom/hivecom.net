/**
 * Shared Last.fm API helpers
 */

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
 *
 * We use a pure-JS MD5 because SubtleCrypto does not support MD5.
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

  return md5(raw);
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
      `Last.fm auth.getSession error ${data.error ?? "unknown"}: ${data.message ?? "no session returned"
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
  const track: RawTrack = Array.isArray(trackData)
    ? trackData[0]
    : trackData;

  if (!track) return null;

  const nowPlaying = track["@attr"]?.nowplaying === "true";
  const playedAt =
    !nowPlaying && track.date?.uts
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

// ---------------------------------------------------------------------------
// Pure-JS MD5 implementation (SubtleCrypto does not support MD5)
// Based on the well-known Blueimp implementation, ported to TypeScript.
// ---------------------------------------------------------------------------

function md5(input: string): string {
  const str = unescape(encodeURIComponent(input));
  const x = str2binl(str);
  const result = binl_md5(x, str.length * 8);
  return binl2hex(result);
}

function safe_add(x: number, y: number): number {
  const lsw = (x & 0xffff) + (y & 0xffff);
  const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xffff);
}

function bit_rol(num: number, cnt: number): number {
  return (num << cnt) | (num >>> (32 - cnt));
}

function md5_cmn(
  q: number,
  a: number,
  b: number,
  x: number,
  s: number,
  t: number,
): number {
  return safe_add(bit_rol(safe_add(safe_add(a, q), safe_add(x, t)), s), b);
}

function md5_ff(
  a: number,
  b: number,
  c: number,
  d: number,
  x: number,
  s: number,
  t: number,
): number {
  return md5_cmn((b & c) | (~b & d), a, b, x, s, t);
}

function md5_gg(
  a: number,
  b: number,
  c: number,
  d: number,
  x: number,
  s: number,
  t: number,
): number {
  return md5_cmn((b & d) | (c & ~d), a, b, x, s, t);
}

function md5_hh(
  a: number,
  b: number,
  c: number,
  d: number,
  x: number,
  s: number,
  t: number,
): number {
  return md5_cmn(b ^ c ^ d, a, b, x, s, t);
}

function md5_ii(
  a: number,
  b: number,
  c: number,
  d: number,
  x: number,
  s: number,
  t: number,
): number {
  return md5_cmn(c ^ (b | ~d), a, b, x, s, t);
}

function binl_md5(x: number[], len: number): number[] {
  x[len >> 5] |= 0x80 << len % 32;
  x[(((len + 64) >>> 9) << 4) + 14] = len;

  let i: number;
  let olda: number;
  let oldb: number;
  let oldc: number;
  let oldd: number;
  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;

  for (i = 0; i < x.length; i += 16) {
    olda = a;
    oldb = b;
    oldc = c;
    oldd = d;

    a = md5_ff(a, b, c, d, x[i], 7, -680876936);
    d = md5_ff(d, a, b, c, x[i + 1], 12, -389564586);
    c = md5_ff(c, d, a, b, x[i + 2], 17, 606105819);
    b = md5_ff(b, c, d, a, x[i + 3], 22, -1044525330);
    a = md5_ff(a, b, c, d, x[i + 4], 7, -176418897);
    d = md5_ff(d, a, b, c, x[i + 5], 12, 1200080426);
    c = md5_ff(c, d, a, b, x[i + 6], 17, -1473231341);
    b = md5_ff(b, c, d, a, x[i + 7], 22, -45705983);
    a = md5_ff(a, b, c, d, x[i + 8], 7, 1770035416);
    d = md5_ff(d, a, b, c, x[i + 9], 12, -1958414417);
    c = md5_ff(c, d, a, b, x[i + 10], 17, -42063);
    b = md5_ff(b, c, d, a, x[i + 11], 22, -1990404162);
    a = md5_ff(a, b, c, d, x[i + 12], 7, 1804603682);
    d = md5_ff(d, a, b, c, x[i + 13], 12, -40341101);
    c = md5_ff(c, d, a, b, x[i + 14], 17, -1502002290);
    b = md5_ff(b, c, d, a, x[i + 15], 22, 1236535329);

    a = md5_gg(a, b, c, d, x[i + 1], 5, -165796510);
    d = md5_gg(d, a, b, c, x[i + 6], 9, -1069501632);
    c = md5_gg(c, d, a, b, x[i + 11], 14, 643717713);
    b = md5_gg(b, c, d, a, x[i], 20, -373897302);
    a = md5_gg(a, b, c, d, x[i + 5], 5, -701558691);
    d = md5_gg(d, a, b, c, x[i + 10], 9, 38016083);
    c = md5_gg(c, d, a, b, x[i + 15], 14, -660478335);
    b = md5_gg(b, c, d, a, x[i + 4], 20, -405537848);
    a = md5_gg(a, b, c, d, x[i + 9], 5, 568446438);
    d = md5_gg(d, a, b, c, x[i + 14], 9, -1019803690);
    c = md5_gg(c, d, a, b, x[i + 3], 14, -187363961);
    b = md5_gg(b, c, d, a, x[i + 8], 20, 1163531501);
    a = md5_gg(a, b, c, d, x[i + 13], 5, -1444681467);
    d = md5_gg(d, a, b, c, x[i + 2], 9, -51403784);
    c = md5_gg(c, d, a, b, x[i + 7], 14, 1735328473);
    b = md5_gg(b, c, d, a, x[i + 12], 20, -1926607734);

    a = md5_hh(a, b, c, d, x[i + 5], 4, -378558);
    d = md5_hh(d, a, b, c, x[i + 8], 11, -2022574463);
    c = md5_hh(c, d, a, b, x[i + 11], 16, 1839030562);
    b = md5_hh(b, c, d, a, x[i + 14], 23, -35309556);
    a = md5_hh(a, b, c, d, x[i + 1], 4, -1530992060);
    d = md5_hh(d, a, b, c, x[i + 4], 11, 1272893353);
    c = md5_hh(c, d, a, b, x[i + 7], 16, -155497632);
    b = md5_hh(b, c, d, a, x[i + 10], 23, -1094730640);
    a = md5_hh(a, b, c, d, x[i + 13], 4, 681279174);
    d = md5_hh(d, a, b, c, x[i], 11, -358537222);
    c = md5_hh(c, d, a, b, x[i + 3], 16, -722521979);
    b = md5_hh(b, c, d, a, x[i + 6], 23, 76029189);
    a = md5_hh(a, b, c, d, x[i + 9], 4, -640364487);
    d = md5_hh(d, a, b, c, x[i + 12], 11, -421815835);
    c = md5_hh(c, d, a, b, x[i + 15], 16, 530742520);
    b = md5_hh(b, c, d, a, x[i + 2], 23, -995338651);

    a = md5_ii(a, b, c, d, x[i], 6, -198630844);
    d = md5_ii(d, a, b, c, x[i + 7], 10, 1126891415);
    c = md5_ii(c, d, a, b, x[i + 14], 15, -1416354905);
    b = md5_ii(b, c, d, a, x[i + 5], 21, -57434055);
    a = md5_ii(a, b, c, d, x[i + 12], 6, 1700485571);
    d = md5_ii(d, a, b, c, x[i + 3], 10, -1894986606);
    c = md5_ii(c, d, a, b, x[i + 10], 15, -1051523);
    b = md5_ii(b, c, d, a, x[i + 1], 21, -2054922799);
    a = md5_ii(a, b, c, d, x[i + 8], 6, 1873313359);
    d = md5_ii(d, a, b, c, x[i + 15], 10, -30611744);
    c = md5_ii(c, d, a, b, x[i + 6], 15, -1560198380);
    b = md5_ii(b, c, d, a, x[i + 13], 21, 1309151649);
    a = md5_ii(a, b, c, d, x[i + 4], 6, -145523070);
    d = md5_ii(d, a, b, c, x[i + 11], 10, -1120210379);
    c = md5_ii(c, d, a, b, x[i + 2], 15, 718787259);
    b = md5_ii(b, c, d, a, x[i + 9], 21, -343485551);

    a = safe_add(a, olda);
    b = safe_add(b, oldb);
    c = safe_add(c, oldc);
    d = safe_add(d, oldd);
  }

  return [a, b, c, d];
}

function str2binl(str: string): number[] {
  const bin: number[] = [];
  const mask = (1 << 8) - 1;
  for (let i = 0; i < str.length * 8; i += 8) {
    bin[i >> 5] |= (str.charCodeAt(i / 8) & mask) << i % 32;
  }
  return bin;
}

function binl2hex(binarray: number[]): string {
  const hexTab = "0123456789abcdef";
  let str = "";
  for (let i = 0; i < binarray.length * 4; i++) {
    str += hexTab.charAt((binarray[i >> 2] >> (i % 4) * 8 + 4) & 0xf) +
      hexTab.charAt((binarray[i >> 2] >> (i % 4) * 8) & 0xf);
  }
  return str;
}
