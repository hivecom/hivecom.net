// Shared offline decode for the audio visualizations. Fetches a track and
// decodes it to PCM without ever touching the shared playback <audio> element.
//
// We deliberately never call createMediaElementSource on the engine's element:
// that tap is permanent and per-element, and the engine reuses one element for
// every track, so a single cross-origin track without CORS headers would mute
// all playback from then on. Decoding a separate copy here keeps visualization
// fully isolated from sound: worst case the fetch fails (CORS) and the caller
// falls back to a plain timeline, audio untouched.

// One AudioContext, lazily created, reused for every decode. decodeAudioData
// works on a suspended context, so this never needs a user gesture or makes
// sound.
let decodeCtx: AudioContext | null = null

function getDecodeContext(): AudioContext {
  if (!decodeCtx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    decodeCtx = new Ctor()
  }
  return decodeCtx
}

// In-flight decodes keyed by src, so the waveform and the spectrum (which mount
// together and both want the same track) share one fetch and one decode instead
// of doing the whole expensive job twice.
const inflight = new Map<string, Promise<AudioBuffer>>()

// In-flight byte fetches keyed by src, separate from the decode dedup above. A
// future tag reader (lib/audio/tags) and the PCM decode both want the same raw
// bytes, so this collapses them into ONE network request instead of two. We
// don't cache the resolved ArrayBuffer: the browser HTTP cache already serves
// the second reader cheaply, and holding the raw bytes alongside the decoded
// PCM would double the memory for no real win.
const bytesInflight = new Map<string, Promise<ArrayBuffer>>()

// Fetch a track to raw bytes, deduped per src. Exported so lib/audio/tags can
// read ID3 off the same fetch the decode uses. Rejects if the file can't be
// fetched (e.g. cross-origin without CORS); callers degrade gracefully.
export async function fetchAudioBytes(src: string): Promise<ArrayBuffer> {
  const existing = bytesInflight.get(src)
  if (existing)
    return existing

  const job = (async () => {
    // Fetch off a URL distinct from the one the <audio> element loads. The
    // player loads the file with no Origin (no crossorigin), which can seed the
    // browser cache with a copy that carries no CORS header; a plain fetch of
    // the same URL would reuse it and fail the cross-origin read. A dedicated
    // query param gives this request its own cache entry that goes through CORS
    // cleanly. Depot's nginx keys its download cache on path only, so this never
    // fragments the server-side cache, and both visualizations share the one
    // param so they reuse each other's browser cache entry.
    //
    // blob:/data: URLs (a dropped local file in the playground) are same-origin
    // and have no query string, so skip the param: appending it would make a URL
    // the blob store can't resolve.
    const isLocal = src.startsWith('blob:') || src.startsWith('data:')
    const url = isLocal ? src : `${src}${src.includes('?') ? '&' : '?'}viz=1`
    const res = await fetch(url)
    if (!res.ok)
      throw new Error(`Failed to fetch audio: ${res.status}`)
    return res.arrayBuffer()
  })()

  bytesInflight.set(src, job)
  try {
    return await job
  }
  finally {
    bytesInflight.delete(src)
  }
}

// One decoded buffer held back, so prewarming a track (see lib/audio/prewarm)
// lets the fullscreen spectrum open instantly instead of decoding on the spot.
// Bounded to a single entry: a fresh decode replaces it and the old PCM is GC'd,
// and clearDecodeCache drops it when playback ends.
let cachedSrc: string | null = null
let cachedBuffer: AudioBuffer | null = null

// Fetch and decode a track to an AudioBuffer. Rejects if the file can't be
// fetched (e.g. cross-origin without CORS) or decoded; callers should treat
// that as "no visualization available" and degrade gracefully.
export async function decodeAudio(src: string): Promise<AudioBuffer> {
  if (cachedSrc === src && cachedBuffer)
    return cachedBuffer

  const existing = inflight.get(src)
  if (existing)
    return existing

  const job = (async () => {
    // Pull the raw bytes through the shared fetch (its own dedup, so a tag read
    // riding the same src shares this request) and hand them to decodeAudioData.
    // We throw the bytes away after; only the decoded PCM is worth holding.
    const bytes = await fetchAudioBytes(src)
    return getDecodeContext().decodeAudioData(bytes)
  })()

  inflight.set(src, job)
  try {
    const buffer = await job
    cachedSrc = src
    cachedBuffer = buffer
    return buffer
  }
  finally {
    inflight.delete(src)
  }
}

// Drop the held buffer to free its PCM (tens of MB on long tracks) once the
// player is closed and nothing needs the visuals anymore.
export function clearDecodeCache(): void {
  cachedSrc = null
  cachedBuffer = null
}
