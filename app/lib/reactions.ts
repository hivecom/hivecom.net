/**
 * Reactions - shared types, constants, and helpers.
 *
 * Shape stored in the DB (reactions JSONB column):
 *
 *   {
 *     "hivecom": {                        ← provider key
 *       "👍": ["<uuid>", "<uuid>"],       ← emote → array of user UUIDs
 *       "❤️": ["<uuid>"]
 *     },
 *     "xdd": {                            ← external provider
 *       "PogChamp": ["<uuid>"]
 *     }
 *   }
 *
 * The top-level provider key makes it safe to merge reactions from different
 * sources without colliding.
 *
 * The DB accepts any emote string (up to 32 characters) and any provider key
 * (up to 64 characters). Front-ends decide which emotes to render - if an
 * emote doesn't map to anything the UI recognises, it is simply not displayed.
 */

import type { ReactionData } from '@/types/database.overrides'

// Re-export so callers only need to import from this one file.
export type { ReactionData } from '@/types/database.overrides'

// ─────────────────────────────────────────────────────────────────────────────
// Provider identifiers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Built-in first-party provider key. Used as the default when toggling
 * reactions from the hivecom front-end.
 */
export const HIVECOM_PROVIDER = 'hivecom' as const

// ─────────────────────────────────────────────────────────────────────────────
// Display-layer emote manifest (hivecom provider)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Grouped emote manifest for the hivecom reaction picker.
 * This is the single source of truth - the flat list and picker UI are both
 * derived from this. Add emotes here only; ReactionsSelect.vue reads this directly.
 *
 * This is a **display-layer constant**, not a validation list - the DB accepts any emoji.
 */
export const HIVECOM_EMOTE_GROUPS: { label: string, emotes: string[] }[] = [
  {
    label: 'Reactions',
    emotes: ['👍', '👎', '🙌', '❤️', '🔥', '🎉', '👀', '💯', '💀', '⭐', '🏆'],
  },
  {
    label: 'Emoticons',
    emotes: ['😂', '😢', '😭', '😳', '🤯', '😍', '😡', '🤔', '😴', '🫠', '😎'],
  },
  {
    label: 'Symbols',
    emotes: ['✅', '❎', '🅰️', '🅱️', '🆒', '🆗', '⚠️'],
  },
  {
    label: 'Other',
    emotes: ['💅', '🚀', '🏳️‍🌈', '🗿', '🍆', '🍑', '💦', '🌡️', '☀️', '🌧️', '🌞', '🌚', '🌿', '🌱', '🥀', '🐺', '🥚'],
  },
]

/** Flat list of all known hivecom emotes, derived from HIVECOM_EMOTE_GROUPS. */
export const HIVECOM_EMOTES = HIVECOM_EMOTE_GROUPS.flatMap(g => g.emotes)

export type HivecomEmote = string

/** Fast O(1) membership check for display-layer filtering. */
const HIVECOM_EMOTE_SET = new Set<string>(HIVECOM_EMOTES)

/**
 * Returns true if the emote is in the hivecom display manifest.
 * Useful for display-layer filtering - NOT used as a write-path guard.
 */
export function isHivecomEmote(emote: string): emote is HivecomEmote {
  return HIVECOM_EMOTE_SET.has(emote)
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw DB shape
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The raw JSONB value that comes back from Supabase.
 * Each provider maps emote strings to arrays of user-UUID strings.
 *
 * This is an alias for ReactionData (the type stored in the DB) - kept
 * separate so component-level code can use the more descriptive name.
 */
export type RawReactions = ReactionData

/**
 * Coerce the loosely-typed value from the DB into a RawReactions map.
 * Returns an empty object when the value is absent or malformed, so callers
 * never have to null-check.
 */
export function parseRawReactions(value: unknown): RawReactions {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as RawReactions
  }
  return {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived / display shape
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single displayable reaction - what the Reactions UI components consume.
 *
 * `content`  is the emote string (emoji or external emote key).
 * `count`    is the total number of users who reacted with it.
 * `byMe`     is true when the current user's UUID is in the reactors list.
 * `provider` tracks where the reaction originated (for future provider UI).
 * `reactors` is the full list of user UUIDs who reacted with this emote.
 */
export interface DisplayReaction {
  content: string
  count: number
  byMe: boolean
  provider: string
  reactors: string[]
}

/**
 * Build a flat list of DisplayReactions from a raw reactions object.
 *
 * @param raw      The parsed reactions JSONB value.
 * @param userId   The currently authenticated user's UUID (or null/undefined).
 * @param providers Optional allow-list of providers to include.  When omitted
 *                  all providers present in the raw object are included.
 */
export function buildDisplayReactions(
  raw: RawReactions,
  userId: string | null | undefined,
  providers?: string[],
): DisplayReaction[] {
  const result: DisplayReaction[] = []
  const targetProviders = providers ?? Object.keys(raw)

  for (const provider of targetProviders) {
    const emotes = raw[provider]
    if (!emotes || typeof emotes !== 'object')
      continue

    for (const [emote, reactors] of Object.entries(emotes)) {
      if (!Array.isArray(reactors) || reactors.length === 0)
        continue

      // For the hivecom provider, skip emotes not in the display manifest.
      // External providers (e.g. "xdd") have their own emote namespaces so
      // we leave those unfiltered.
      if (provider === HIVECOM_PROVIDER && !isHivecomEmote(emote))
        continue

      result.push({
        content: emote,
        count: reactors.length,
        byMe: userId !== null && userId !== undefined && reactors.includes(userId),
        provider,
        reactors: [...reactors],
      })
    }
  }

  // Stable sort: higher count first, then alphabetical emote for tie-breaking
  result.sort((a, b) => b.count - a.count || a.content.localeCompare(b.content))

  return result
}

/**
 * Optimistically apply a reaction toggle to a RawReactions object.
 * Returns a new object (no mutation) so Vue's reactivity picks up the change.
 *
 * @param raw      Current parsed reactions.
 * @param provider Provider key (e.g. "hivecom").
 * @param emote    Emote string to toggle.
 * @param userId   The current user's UUID.
 */
export function applyOptimisticToggle(
  raw: RawReactions,
  provider: string,
  emote: string,
  userId: string,
): RawReactions {
  const providerMap = { ...(raw[provider] ?? {}) }
  const current: string[] = Array.isArray(providerMap[emote])
    ? [...providerMap[emote]]
    : []

  const idx = current.indexOf(userId)
  if (idx === -1) {
    current.push(userId)
  }
  else {
    current.splice(idx, 1)
  }

  if (current.length === 0) {
    const { [emote]: _removed, ...rest } = providerMap
    const updatedProvider = rest

    if (Object.keys(updatedProvider).length === 0) {
      const { [provider]: _p, ...rootRest } = raw
      return rootRest
    }

    return { ...raw, [provider]: updatedProvider }
  }

  return {
    ...raw,
    [provider]: { ...providerMap, [emote]: current },
  }
}
