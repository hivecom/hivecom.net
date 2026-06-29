// Warm the fullscreen player's visuals for a track in the background, so opening
// the view is instant instead of decoding and analyzing on the spot. Decoding
// fills the shared buffer cache the spectrum reads (lib/audio/decode), and
// computeWaveform caches the peaks the waveform draws; the inflight dedup in
// decodeAudio collapses both into one fetch and one decode.
//
// Fire-and-forget: a failure (e.g. cross-origin without CORS) just means the
// views fall back to their loading/empty states, exactly as before.

import { decodeAudio } from '@/lib/audio/decode'
import { computeWaveform } from '@/lib/audio/waveform'

export function prewarmAudioVisuals(src: string): void {
  if (!import.meta.client)
    return
  void decodeAudio(src).catch(() => {})
  void computeWaveform(src).catch(() => {})
}
