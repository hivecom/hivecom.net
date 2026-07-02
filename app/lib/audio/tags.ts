// Reads a track's embedded metadata (title, artist, album, cover art) off the
// same bytes the decode already fetches, so it costs no extra network round-trip.
// Rides fetchAudioBytes and its per-src dedup: a tag read and the PCM decode
// share one fetch.
//
// Everything degrades to null on failure (cross-origin, no tags, unparseable) so
// callers keep the filename title they show today.

import { parseBuffer } from 'music-metadata'
import { fetchAudioBytes } from '@/lib/audio/decode'

export interface AudioTags {
  title?: string
  artist?: string
  album?: string
  cover?: string // object URL for an <img>, or undefined
}

// Read tags for a track. Returns null on any failure so callers degrade to the
// filename title. The cover, when present, is an object URL the caller owns and
// must revoke on track change or reset (see useAudioPlayer) or the blob leaks.
export async function readTags(src: string): Promise<AudioTags | null> {
  try {
    // parseBuffer keeps the whole file in-memory and off the Node-stream paths,
    // so Vite bundles this for the browser without polyfills. Never parseFile or
    // any stream/fs entry point.
    const bytes = new Uint8Array(await fetchAudioBytes(src))
    const meta = await parseBuffer(bytes)
    const { title, artist, album, picture } = meta.common

    let cover: string | undefined
    const pic = picture?.[0]
    if (pic) {
      // slice() copies into a fresh ArrayBuffer-backed view so the Blob part
      // types line up under strict lib (music-metadata hands back a generic
      // Uint8Array over ArrayBufferLike).
      cover = URL.createObjectURL(new Blob([pic.data.slice()], { type: pic.format }))
    }

    return { title, artist, album, cover }
  }
  catch {
    return null
  }
}
