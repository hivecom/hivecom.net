// Embedded tags off the same fetch the PCM decode uses, so no extra round trip.

import { parseBuffer } from 'music-metadata'
import { fetchAudioBytes } from '@/lib/audio/decode'

export interface AudioTags {
  title?: string
  artist?: string
  album?: string
  cover?: string // object URL
}

// Null on any failure, so callers fall back to the filename. The caller owns
// the cover object URL and must revoke it on track change or the blob leaks.
export async function readTags(src: string): Promise<AudioTags | null> {
  try {
    // parseBuffer stays off the Node stream paths, so Vite bundles it without
    // polyfills. Never use parseFile or any stream/fs entry point.
    const bytes = new Uint8Array(await fetchAudioBytes(src))
    const meta = await parseBuffer(bytes)
    const { title, artist, album, picture } = meta.common

    let cover: string | undefined
    const pic = picture?.[0]
    if (pic) {
      // slice() copies into an ArrayBuffer-backed view. music-metadata returns
      // one over ArrayBufferLike, which Blob rejects under strict lib types.
      cover = URL.createObjectURL(new Blob([pic.data.slice()], { type: pic.format }))
    }

    return { title, artist, album, cover }
  }
  catch {
    return null
  }
}
