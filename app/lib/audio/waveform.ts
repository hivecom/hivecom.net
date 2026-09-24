// Reduces a decoded track to a row of peak amplitudes for the player's bars.

import { decodeAudio } from '@/lib/audio/decode'
import { keyedAsyncCache } from '@/lib/audio/keyedAsyncCache'

export interface WaveformData {
  // 0..1 per bar. The canvas samples these down to what fits.
  peaks: Float32Array
}

const BARS = 1024

// A long track's bar spans tens of thousands of samples. A strided peak tracks
// the envelope just as well and turns a ~50M-sample scan into a couple million.
const READS_PER_BAR = 2048

function analyze(buffer: AudioBuffer): WaveformData {
  const channels = buffer.numberOfChannels
  const length = buffer.length
  const peaks = new Float32Array(BARS)
  const samplesPerBar = length / BARS

  const data: Float32Array[] = []
  for (let c = 0; c < channels; c++)
    data.push(buffer.getChannelData(c))
  const stride = Math.max(1, Math.floor(samplesPerBar / READS_PER_BAR))

  for (let bar = 0; bar < BARS; bar++) {
    const start = Math.floor(bar * samplesPerBar)
    const end = Math.min(length, Math.floor((bar + 1) * samplesPerBar))
    let peak = 0

    // Across every channel, so a hard-panned hit reads as loud as a centered one.
    for (let c = 0; c < channels; c++) {
      const ch = data[c]!
      for (let i = start; i < end; i += stride) {
        const v = Math.abs(ch[i]!)
        if (v > peak)
          peak = v
      }
    }
    peaks[bar] = peak
  }

  // So a quiet track still fills the height.
  let max = 0
  for (let i = 0; i < BARS; i++) {
    if (peaks[i]! > max)
      max = peaks[i]!
  }
  if (max > 0) {
    for (let i = 0; i < BARS; i++)
      peaks[i]! /= max
  }

  // Keeps quiet detail visible without loud sections clipping into one block.
  for (let i = 0; i < BARS; i++)
    peaks[i] = peaks[i]! ** 0.7

  return { peaks }
}

const waveforms = keyedAsyncCache(async (src: string) => analyze(await decodeAudio(src)))

// A rejection means no waveform is available.
export async function computeWaveform(src: string): Promise<WaveformData> {
  return waveforms.get(src)
}
