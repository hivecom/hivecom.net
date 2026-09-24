// A notification sound design is a sequence of synthesized tones. It lives in
// types/ so the JSONB column overrides can use it without importing from app/.

// A `type` so it stays assignable to Json. Interfaces lack the implicit index
// signature Json requires.
// eslint-disable-next-line ts/consistent-type-definitions -- see comment above
export type SoundDesignTone = {
  /** Hz */
  freq: number
  /** Glide target in Hz */
  endFreq?: number
  /** Seconds from playback start */
  start: number
  /** Seconds */
  duration: number
  /** 0-1, applied before the user's volume */
  gain: number
  /** Seconds */
  attack?: number
}

export type SoundDesign = SoundDesignTone[]
