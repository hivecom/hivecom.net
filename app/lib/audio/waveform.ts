// Offline waveform analysis. Decodes a track once and reduces it to a row of
// peak amplitudes, the SoundCloud-style "bars" the fullscreen player paints. The
// fetch/decode (and why it never taps the live <audio> element) lives in
// lib/audio/decode.

import { decodeAudio } from '@/lib/audio/decode'

export interface WaveformData {
  // Per-bar peak amplitude in 0..1, left to right across the whole track. The
  // canvas decides how many bars to actually draw and samples this down.
  peaks: Float32Array
}

// Analysis resolution. High enough that a wide player still shows fine detail,
// the canvas buckets these down to whatever fits its width.
const BARS = 1024

// Computed waveforms keyed by src so reopening the same track is instant.
const cache = new Map<string, WaveformData>()
const inflight = new Map<string, Promise<WaveformData>>()

// Cap on how many samples each bar actually reads. Past this we step over the
// bar's window instead of touching every sample: a long track's bar can span
// tens of thousands of samples, and a strided peak tracks the envelope the same
// while turning a ~50M-sample scan into a couple million. Short tracks (small
// windows) fall back to reading everything.
const READS_PER_BAR = 2048

function analyze(buffer: AudioBuffer): WaveformData {
  const channels = buffer.numberOfChannels
  const length = buffer.length
  const peaks = new Float32Array(BARS)
  const samplesPerBar = length / BARS
  // Hoist the channel views out of the loop; getChannelData is cheap but no
  // reason to call it per bar.
  const data: Float32Array[] = []
  for (let c = 0; c < channels; c++)
    data.push(buffer.getChannelData(c))
  const stride = Math.max(1, Math.floor(samplesPerBar / READS_PER_BAR))

  for (let bar = 0; bar < BARS; bar++) {
    const start = Math.floor(bar * samplesPerBar)
    const end = Math.min(length, Math.floor((bar + 1) * samplesPerBar))
    let peak = 0
    // Loudest sample in the window across every channel, so a hard-panned hit
    // reads as loud as a centered one.
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

  // Normalize to the loudest bar so a quiet track still fills the height.
  let max = 0
  for (let i = 0; i < BARS; i++) {
    if (peaks[i]! > max)
      max = peaks[i]!
  }
  if (max > 0) {
    for (let i = 0; i < BARS; i++)
      peaks[i]! /= max
  }

  // Gentle perceptual curve so quiet detail stays visible without the loud
  // sections clipping into one flat block.
  for (let i = 0; i < BARS; i++)
    peaks[i] = peaks[i]! ** 0.7

  return { peaks }
}

// Decode and analyze a track, caching the result. Rejects if the file can't be
// fetched (e.g. cross-origin without CORS) or decoded; callers should treat that
// as "no waveform available" and degrade gracefully.
export async function computeWaveform(src: string): Promise<WaveformData> {
  const cached = cache.get(src)
  if (cached)
    return cached

  const existing = inflight.get(src)
  if (existing)
    return existing

  const job = (async () => {
    const buffer = await decodeAudio(src)
    const result = analyze(buffer)
    cache.set(src, result)
    return result
  })()

  inflight.set(src, job)
  try {
    return await job
  }
  finally {
    inflight.delete(src)
  }
}
