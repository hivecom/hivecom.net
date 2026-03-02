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
 *     "xdd": {                            ← future external provider
 *       "PogChamp": ["<uuid>"]
 *     }
 *   }
 *
 * The top-level provider key makes it safe to merge reactions from external
 * sources (e.g. the xdd project) without colliding with native Hivecom ones.
 *
 * IMPORTANT: Keep ALLOWED_HIVECOM_EMOTES in sync with
 * get_allowed_hivecom_emotes() in the DB migration.
 */

import type { ReactionData } from '@/types/database.overrides'

// Re-export so callers only need to import from this one file.
export type { ReactionData } from '@/types/database.overrides'

// ─────────────────────────────────────────────────────────────────────────────
// Provider identifiers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Built-in first-party provider.  Emotes are validated against
 * ALLOWED_HIVECOM_EMOTES on both the client and the DB trigger.
 */
export const HIVECOM_PROVIDER = 'hivecom' as const

/**
 * Known provider keys.  Extend this union as new integrations are added.
 * The DB itself stores any string key - the type only enforces what we know
 * about on the front-end.
 */
export type KnownProvider = typeof HIVECOM_PROVIDER | 'xdd'

// ─────────────────────────────────────────────────────────────────────────────
// Allowed emotes (hivecom provider)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical emote list for the "hivecom" provider.
 * Must stay in sync with get_allowed_hivecom_emotes() in the DB.
 */
export const ALLOWED_HIVECOM_EMOTES = [
  // ── Reactions ─────────────────────────────────────────────────────────────
  '👍',
  '👎',
  '🙌',
  '❤️',
  '🔥',
  '🎉',
  '👀',
  '💯',
  '💀',
  '⭐',
  '🏆',
  // ── Emoticons ─────────────────────────────────────────────────────────────
  '😂',
  '😢',
  '😭',
  '😳',
  '🤯',
  '😍',
  '😡',
  '🤔',
  '😴',
  '🫠',
  // ── Symbols ───────────────────────────────────────────────────────────────
  '✅',
  '❎',
  '🅰️',
  '🅱️',
  '🆒',
  '🆗',
  '⚠️',
  // ── Other ─────────────────────────────────────────────────────────────────
  '💅',
  '🚀',
  '🏳️‍🌈',
  '🗿',
  '🍆',
  '🍑',
  '💦',
  '🌡️',
  '☀️',
  '🌧️',
  '🌞',
  '🌚',
  '🌿',
  '🌱',
  '🥀',
] as const

export type HivecomEmote = typeof ALLOWED_HIVECOM_EMOTES[number]

/** Fast O(1) membership check */
const ALLOWED_HIVECOM_SET = new Set<string>(ALLOWED_HIVECOM_EMOTES)

export function isAllowedHivecomEmote(emote: string): emote is HivecomEmote {
  return ALLOWED_HIVECOM_SET.has(emote)
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
