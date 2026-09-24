/**
 * Every `useCache` or `useCachedFetch` namespace gets registered here instead
 * of an inline `storagePrefix`. Prefixes must be unique and end with `:`.
 * `ttl` is in milliseconds.
 */

import type { CacheConfig } from '@/composables/useCache'

export const CACHE_NAMESPACES = {
  default: {
    storagePrefix: 'hivecom:cache:',
    ttl: 5 * 60 * 1000,
    maxEntries: 200,
  },
  events: {
    storagePrefix: 'hivecom:cache:ev:',
    ttl: 5 * 60 * 1000,
    maxEntries: 50,
  },
  forum: {
    storagePrefix: 'hivecom:cache:fo:',
    ttl: 10 * 60 * 1000,
    maxEntries: 300,
  },
  games: {
    storagePrefix: 'hivecom:cache:gm:',
    ttl: 30 * 60 * 1000,
    maxEntries: 50,
  },
  gameservers: {
    storagePrefix: 'hivecom:cache:gs:',
    ttl: 30 * 60 * 1000,
    maxEntries: 50,
  },
  projects: {
    storagePrefix: 'hivecom:cache:pr:',
    ttl: 60 * 60 * 1000,
    maxEntries: 100,
  },
  community: {
    storagePrefix: 'hivecom:cache:co:',
    ttl: 10 * 60 * 1000,
    maxEntries: 100,
  },
  discussions: {
    storagePrefix: 'hivecom:cache:di:',
    ttl: 3 * 60 * 1000,
    maxEntries: 200,
  },
  replies: {
    storagePrefix: 'hivecom:cache:re:',
    ttl: 3 * 60 * 1000,
    maxEntries: 500,
  },
  profiles: {
    storagePrefix: 'hivecom:cache:pf:',
    ttl: 10 * 60 * 1000,
    maxEntries: 200,
  },
  badges: {
    storagePrefix: 'hivecom:cache:ba:',
    ttl: 10 * 60 * 1000,
    maxEntries: 200,
  },
  themes: {
    storagePrefix: 'hivecom:cache:tm:',
    ttl: 10 * 60 * 1000,
    maxEntries: 100,
  },
  /** Referendums. */
  votes: {
    storagePrefix: 'hivecom:cache:vo:',
    ttl: 3 * 60 * 1000,
    maxEntries: 100,
  },
  /** Short TTL since RSVPs change on interaction. */
  rsvps: {
    storagePrefix: 'hivecom:cache:rv:',
    ttl: 2 * 60 * 1000,
    maxEntries: 300,
  },
  /** data_steam_games, observed via rich presence. */
  steamGames: {
    storagePrefix: 'hivecom:cache:sg:',
    ttl: 60 * 60 * 1000,
    maxEntries: 500,
  },
} satisfies Record<string, CacheConfig>
