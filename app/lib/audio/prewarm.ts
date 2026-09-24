// Fills the decode and waveform caches in the background so the fullscreen
// player opens instantly. Fire-and-forget: a failure only leaves the views on
// their loading or empty states.

import { decodeAudio } from '@/lib/audio/decode'
import { computeWaveform } from '@/lib/audio/waveform'

export function prewarmAudioVisuals(src: string): void {
  if (!import.meta.client)
    return

  void decodeAudio(src).catch(() => {})
  void computeWaveform(src).catch(() => {})
}
