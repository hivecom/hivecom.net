// Offline decode for the audio visualizations, kept away from the playback
// <audio> element on purpose. createMediaElementSource is a permanent tap and
// the engine reuses one element for every track, so a single cross-origin track
// without CORS would mute all playback from then on. Here the worst case is a
// failed fetch and a plain timeline.

// decodeAudioData works on a suspended context, so this never needs a user
// gesture or makes sound.
let decodeCtx: AudioContext | null = null

function getDecodeContext(): AudioContext {
  if (!decodeCtx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    decodeCtx = new Ctor()
  }
  return decodeCtx
}

// The waveform and spectrum mount together and want the same track.
const inflight = new Map<string, Promise<AudioBuffer>>()

// The tag reader and the PCM decode share one request. Resolved bytes aren't
// cached: the HTTP cache serves a second reader cheaply, and holding them next
// to the PCM would double the memory.
const bytesInflight = new Map<string, Promise<ArrayBuffer>>()

// Rejects when the file can't be fetched, e.g. cross-origin without CORS.
export async function fetchAudioBytes(src: string): Promise<ArrayBuffer> {
  const existing = bytesInflight.get(src)
  if (existing)
    return existing

  const job = (async () => {
    // The <audio> element loads without crossorigin, which can seed the browser
    // cache with a copy that has no CORS header. A plain fetch of the same URL
    // would reuse it and fail. The param gives this request its own cache entry.
    // Depot's nginx keys its cache on path only, so the server side doesn't
    // fragment.
    //
    // blob: and data: URLs can't take a query string.
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

// A single entry, so a prewarmed track opens the fullscreen spectrum instantly
// without holding PCM for every track.
let cachedSrc: string | null = null
let cachedBuffer: AudioBuffer | null = null

// A rejection means no visualization is available.
export async function decodeAudio(src: string): Promise<AudioBuffer> {
  if (cachedSrc === src && cachedBuffer)
    return cachedBuffer

  const existing = inflight.get(src)
  if (existing)
    return existing

  const job = (async () => {
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

// Frees tens of MB of PCM on a long track.
export function clearDecodeCache(): void {
  cachedSrc = null
  cachedBuffer = null
}
