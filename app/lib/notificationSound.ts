// Notification cues for chat. Sounds are described by a small preset registry
// (`SOUND_PRESETS`) so new options are a one-line addition. A preset is either:
//   - a generated tone sequence (Web Audio, no asset), or
//   - a bundled/remote audio file (`url`) - this is the seam for plugging in
//     hand-made sounds later: drop a file in `public/sounds/` and add an entry
//     with `{ id, label, url: '/sounds/whatever.mp3' }`.
// The special `custom` choice (not in the registry) plays a user-supplied URL,
// and the `design` choice plays a user-authored tone sequence (`SoundDesign`).

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

// The synth tone is the same shape as a user design unit, so the canonical type
// lives in `@/types/sound` (see that file for why) and is aliased here.
//   - `endFreq`: optional glide target; the oscillator ramps `freq` -> `endFreq`
//     over `duration` (a pitch envelope), e.g. the snap of a "pop".
//   - `attack`: gain-envelope attack (seconds). Defaults to 10ms, which keeps
//     tonal cues soft; percussive cues want a near-instant onset (~1ms).
type Tone = SoundDesignTone

export interface SoundPreset {
  id: string
  label: string
  // Exactly one of `tones` / `url` is used. `tones` is synthesized on the fly;
  // `url` points at a bundled or remote audio file (the hand-made-sound seam).
  tones?: Tone[]
  url?: string
}

// The `none` choice id disables a cue. The `custom` choice id plays a
// user-supplied URL. The `design` choice id plays a user-authored tone
// sequence. None appear in the registry - the UI appends them as explicit
// options.
export const NONE_SOUND_ID = 'none'
export const CUSTOM_SOUND_ID = 'custom'
export const DESIGN_SOUND_ID = 'design'

// Bounds for user-authored designs. These keep playback sane and protect ears:
// an untrusted/garbled blob can never produce an inaudibly long, deafening, or
// CPU-heavy cue.
export const DESIGN_MAX_TONES = 8
export const DESIGN_MAX_TIME = 3 // seconds, ceiling for `start` and `duration`
export const DESIGN_MAX_GAIN = 0.4
export const DESIGN_MIN_FREQ = 20
export const DESIGN_MAX_FREQ = 12000
export const DESIGN_MAX_ATTACK = 1

// Built-in presets. Add a `url`-based entry here to ship a hand-made sound.
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
    // Sharp onset so it reads as a clean UI blip rather than a soft beep.
    tones: [
      { freq: 660, start: 0, duration: 0.05, gain: 0.10, attack: 0.001 },
    ],
  },
  {
    id: 'ping',
    label: 'Ping',
    // Instant metallic strike (1ms attack) into a long, ringing decay.
    tones: [
      { freq: 1244.51, start: 0, duration: 0.3, gain: 0.10, attack: 0.001 },
    ],
  },
  {
    id: 'drop',
    label: 'Drop',
    // Two woody thunks: each is an instant onset with a fast downward pitch
    // drop, which reads far more like a knuckle rap than a flat low sine.
    tones: [
      { freq: 300, endFreq: 90, start: 0, duration: 0.09, gain: 0.26, attack: 0.001 },
      { freq: 180, endFreq: 80, start: 0.13, duration: 0.5, gain: 0.26, attack: 0.001 },
    ],
  },
  {
    id: 'creak',
    label: 'Creak',
    // A fast downward pitch glide with a short decay reads as a percussive
    // "creak" (like a bubble), rather than the lingering "bwoop" of a long tail.
    tones: [
      { freq: 1300, endFreq: 200, start: 0, duration: 0.045, gain: 0.28, attack: 0.001 },
    ],
  },
]

const presetById = new Map(SOUND_PRESETS.map(p => [p.id, p]))

// Clamp an arbitrary number to the 0-1 range used for gain/volume.
function clamp01(value: number): number {
  if (Number.isNaN(value))
    return 1
  return Math.min(1, Math.max(0, value))
}

// Coerce to a finite number, or null if it isn't one.
function finiteNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function clampNum(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Validate and clamp an untrusted value into a playable `SoundDesign`.
 *
 * Designs are stored as JSONB and may arrive malformed (old data, hand-edited
 * settings, etc.), so every field is range-checked and the sequence is capped.
 * Returns `null` when there's nothing playable, which callers treat as silence.
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
  // Autoplay policies suspend the context until a user gesture; resume best-effort.
  if (ctx.state === 'suspended')
    void ctx.resume()

  // Small scheduling lead: scheduling envelope events at exactly `currentTime`
  // races the audio render thread, which often passes that timestamp before the
  // events apply, eating part of the attack (audible as inconsistent clicks or
  // soft, "squishy" onsets). A ~20ms lead guarantees the full envelope plays.
  const now = ctx.currentTime + 0.02
  for (const tone of tones) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = tone.freq

    const start = now + tone.start
    const end = start + tone.duration
    // Optional pitch glide: ramp the oscillator from `freq` to `endFreq`.
    // Exponential tracks perceived pitch better and can't cross zero (freqs
    // are positive), so clamp the target away from 0.
    if (tone.endFreq != null) {
      osc.frequency.setValueAtTime(tone.freq, start)
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, tone.endFreq), end)
    }
    // Quick attack, exponential release so the cue is soft rather than jarring.
    // Clamp the attack so it never runs past the tone's own end.
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

// Cache <audio> elements per URL so we don't re-allocate on every ping.
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
  // Rewind so rapid consecutive pings each restart the clip rather than no-op.
  el.currentTime = 0
  // Swallow autoplay/decoding rejections; a bad URL should never throw upstream.
  void el.play().catch(() => {})
}

/**
 * Play a notification cue.
 *
 * @param choice    A preset id from `SOUND_PRESETS`, `CUSTOM_SOUND_ID`, or
 *                  `DESIGN_SOUND_ID`.
 * @param customUrl URL to play when `choice` is `custom` (ignored otherwise).
 * @param volume    0-1 fraction (default 1).
 * @param design    Tone sequence to play when `choice` is `design` (ignored
 *                  otherwise). Validated/clamped via `parseDesign`.
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
