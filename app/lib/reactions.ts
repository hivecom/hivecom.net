/**
 * Shape of the reactions JSONB column, provider key to emote to user UUIDs:
 *
 *   {
 *     "emoji": { "👍": ["<uuid>", "<uuid>"] },
 *     "xdd": { "PogChamp": ["<uuid>"] }
 *   }
 *
 * The provider key keeps reactions from different sources from colliding. The
 * DB accepts any emote up to 32 characters and any provider key up to 64.
 */

import type { ReactionData } from '@/types/database.overrides'

export type { ReactionData } from '@/types/database.overrides'

// ─────────────────────────────────────────────────────────────────────────────
// Provider identifiers
// ─────────────────────────────────────────────────────────────────────────────

export const EMOJI_PROVIDER = 'emoji' as const

// ─────────────────────────────────────────────────────────────────────────────
// Raw DB shape
// ─────────────────────────────────────────────────────────────────────────────

export type RawReactions = ReactionData

// Malformed or missing values come back as {}, so callers never null-check.
export function parseRawReactions(value: unknown): RawReactions {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as RawReactions
  }
  return {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived / display shape
// ─────────────────────────────────────────────────────────────────────────────

export interface DisplayReaction {
  content: string
  count: number
  byMe: boolean
  provider: string
  reactors: string[]
}

/** `providers` is an allow-list. Omit it to include every provider present. */
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

      // No manifest to filter against, so anything stored gets rendered.
      result.push({
        content: emote,
        count: reactors.length,
        byMe: userId !== null && userId !== undefined && reactors.includes(userId),
        provider,
        reactors: [...reactors],
      })
    }
  }

  result.sort((a, b) => b.count - a.count || a.content.localeCompare(b.content))

  return result
}

// Returns a new object rather than mutating, so Vue's reactivity picks it up.
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
