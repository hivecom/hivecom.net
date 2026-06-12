/**
 * sound.ts
 *
 * Shared shape for user-designed notification sounds.
 *
 * A "design" is a sequence of synthesized tones. It lives here in the leaf
 * `types/` layer (rather than alongside the audio code in
 * `app/lib/notificationSound.ts`) so that BOTH the synth lib and the concrete
 * JSONB column types in `database.overrides.ts` can import it without inverting
 * the app -> types dependency direction.
 *
 * Playback and runtime validation/clamping of these values live in
 * `app/lib/notificationSound.ts` (`playTones` / `parseDesign`).
 */

// Declared as a `type` (not `interface`) so it stays assignable to the `Json`
// shape of the `user_settings.data` JSONB column - interfaces lack the implicit
// index signature that `Json` requires.
// eslint-disable-next-line ts/consistent-type-definitions -- see comment above
export type SoundDesignTone = {
  /** Base frequency in Hz. */
  freq: number
  /** Optional glide target; when set the pitch ramps `freq` -> `endFreq`. */
  endFreq?: number
  /** Offset in seconds from playback start. */
  start: number
  /** Tone length in seconds. */
  duration: number
  /** Peak gain (0-1, applied before the user's volume fraction). */
  gain: number
  /** Attack time in seconds for the gain envelope. */
  attack?: number
}

export type SoundDesign = SoundDesignTone[]
