// Chat notification cues. A preset is either a synthesized tone sequence or an
// audio file `url`, e.g. one dropped in `public/sounds/`.

import type { SoundDesign, SoundDesignTone } from '@/types/sound'

let audioCtx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined')
    return null

  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor)
    return null

  audioCtx ??= new Ctor()
  return audioCtx
}

// `attack` defaults to 10ms, which keeps tonal cues soft. Percussive cues want
// about 1ms.
type Tone = SoundDesignTone

export interface SoundPreset {
  id: string
  label: string

  // `url` wins when both are set.
  tones?: Tone[]
  url?: string
}

// Not in the registry. The UI appends these as explicit options.
export const NONE_SOUND_ID = 'none'
export const CUSTOM_SOUND_ID = 'custom'
export const DESIGN_SOUND_ID = 'design'

// Bounds for user-authored designs, so an untrusted or garbled blob can't
// produce a deafening, endless or CPU-heavy cue.
export const DESIGN_MAX_TONES = 8
export const DESIGN_MAX_TIME = 3 // seconds, ceiling for `start` and `duration`
export const DESIGN_MAX_GAIN = 0.4
export const DESIGN_MIN_FREQ = 20
export const DESIGN_MAX_FREQ = 12000
export const DESIGN_MAX_ATTACK = 1

export const SOUND_PRESETS: SoundPreset[] = [
  {
    id: 'chime',
    label: 'Chime',
    tones: [
      { freq: 880, start: 0, duration: 0.14, gain: 0.18 },
      { freq: 1174.66, start: 0.12, duration: 0.18, gain: 0.18 },
    ],
  },
  {
    id: 'blip',
    label: 'Blip',
    tones: [
      { freq: 660, start: 0, duration: 0.05, gain: 0.10, attack: 0.001 },
    ],
  },
  {
    id: 'ping',
    label: 'Ping',
    tones: [
      { freq: 1244.51, start: 0, duration: 0.3, gain: 0.10, attack: 0.001 },
    ],
  },
  {
    id: 'drop',
    label: 'Drop',
    // The fast downward pitch drop reads as a knuckle rap. A flat low sine doesn't.
    tones: [
      { freq: 300, endFreq: 90, start: 0, duration: 0.09, gain: 0.26, attack: 0.001 },
      { freq: 180, endFreq: 80, start: 0.13, duration: 0.5, gain: 0.26, attack: 0.001 },
    ],
  },
  {
    id: 'creak',
    label: 'Creak',
    // A short decay keeps this percussive. A long tail turns into a "bwoop".
    tones: [
      { freq: 1300, endFreq: 200, start: 0, duration: 0.045, gain: 0.28, attack: 0.001 },
    ],
  },
]

const presetById = new Map(SOUND_PRESETS.map(p => [p.id, p]))

function clamp01(value: number): number {
  if (Number.isNaN(value))
    return 1

  return Math.min(1, Math.max(0, value))
}

function finiteNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function clampNum(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Designs are untrusted JSONB, so every field is range-checked and the
 * sequence capped. Null means nothing playable, which callers treat as silence.
 */
export function parseDesign(value: unknown): SoundDesign | null {
  if (!Array.isArray(value) || value.length === 0)
    return null

  const tones: Tone[] = []
  for (const raw of value.slice(0, DESIGN_MAX_TONES)) {
    if (!raw || typeof raw !== 'object')
      continue

    const r = raw as Record<string, unknown>
    const freq = finiteNum(r.freq)
    const start = finiteNum(r.start)
    const duration = finiteNum(r.duration)
    const gain = finiteNum(r.gain)
    if (freq === null || start === null || duration === null || gain === null)
      continue

    const tone: Tone = {
      freq: clampNum(freq, DESIGN_MIN_FREQ, DESIGN_MAX_FREQ),
      start: clampNum(start, 0, DESIGN_MAX_TIME),
      duration: clampNum(duration, 0.005, DESIGN_MAX_TIME),
      gain: clampNum(gain, 0, DESIGN_MAX_GAIN),
    }
    const endFreq = finiteNum(r.endFreq)
    if (endFreq !== null)
      tone.endFreq = clampNum(endFreq, DESIGN_MIN_FREQ, DESIGN_MAX_FREQ)
    const attack = finiteNum(r.attack)
    if (attack !== null)
      tone.attack = clampNum(attack, 0, DESIGN_MAX_ATTACK)

    tones.push(tone)
  }

  return tones.length > 0 ? tones : null
}

function playTones(tones: Tone[], volume: number) {
  const ctx = getContext()
  if (!ctx)
    return

  // Autoplay policies suspend the context until a user gesture.
  if (ctx.state === 'suspended')
    void ctx.resume()

  // Scheduling at exactly `currentTime` races the render thread, which often
  // passes it before the events apply and eats part of the attack. A 20ms lead
  // plays the full envelope.
  const now = ctx.currentTime + 0.02
  for (const tone of tones) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = tone.freq

    const start = now + tone.start
    const end = start + tone.duration

    // An exponential ramp can't reach 0, so clamp the target away from it.
    if (tone.endFreq != null) {
      osc.frequency.setValueAtTime(tone.freq, start)
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, tone.endFreq), end)
    }

    // The attack is clamped so it can't run past the tone's own end.
    const peak = Math.max(0.0001, tone.gain * volume)
    const attack = Math.min(tone.attack ?? 0.01, tone.duration * 0.5)
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(peak, start + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)

    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(end)
  }
}

const audioCache = new Map<string, HTMLAudioElement>()

function playUrl(url: string, volume: number) {
  if (typeof Audio === 'undefined')
    return

  let el = audioCache.get(url)
  if (!el) {
    el = new Audio(url)
    el.preload = 'auto'
    audioCache.set(url, el)
  }
  el.volume = clamp01(volume)

  // Rewind so a ping during playback restarts the clip instead of doing nothing.
  el.currentTime = 0

  // A bad URL should never throw upstream.
  void el.play().catch(() => {})
}

/**
 * `choice` is a preset id or one of the NONE, CUSTOM or DESIGN ids. `volume`
 * is 0-1. `design` is untrusted and goes through `parseDesign`.
 */
export function playNotificationSound(choice: string, customUrl?: string, volume = 1, design?: unknown) {
  if (choice === NONE_SOUND_ID)
    return

  const vol = clamp01(volume)

  if (choice === CUSTOM_SOUND_ID) {
    const trimmed = customUrl?.trim()
    if (trimmed)
      playUrl(trimmed, vol)
    return
  }

  if (choice === DESIGN_SOUND_ID) {
    const tones = parseDesign(design)
    if (tones)
      playTones(tones, vol)
    return
  }

  const preset = presetById.get(choice)
  if (!preset)
    return

  if (preset.url)
    playUrl(preset.url, vol)
  else if (preset.tones)
    playTones(preset.tones, vol)
}
