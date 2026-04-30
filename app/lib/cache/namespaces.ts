/**
 * Central cache namespace registry.
 *
 * Every module that uses `useCache` or `useCachedFetch` should reference
 * its namespace here rather than inlining ad-hoc `storagePrefix` strings.
 *
 * Usage:
 *   import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'
 *   const cache = useCache(CACHE_NAMESPACES.events)
 *   const { data } = useCachedFetch(query, CACHE_NAMESPACES.forum)
 *
 * Rules:
 * - All prefixes are short, unique, and end with `:`.
 * - `ttl` is in milliseconds.
 * - Adding a new module requires registering a new entry here first.
 */

import type { CacheConfig } from '@/composables/useCache'

export const CACHE_NAMESPACES = {
  /** General-purpose fallback namespace. */
  default: {
    storagePrefix: 'hivecom:cache:',
    ttl: 5 * 60 * 1000,
    maxEntries: 200,
  },
  /** Community events. */
  events: {
    storagePrefix: 'hivecom:cache:ev:',
    ttl: 5 * 60 * 1000,
    maxEntries: 50,
  },
  /** Forum threads and posts. */
  forum: {
    storagePrefix: 'hivecom:cache:fo:',
    ttl: 10 * 60 * 1000,
    maxEntries: 300,
  },
  /** Games catalog. */
  games: {
    storagePrefix: 'hivecom:cache:gm:',
    ttl: 30 * 60 * 1000,
    maxEntries: 50,
  },
  /** Game server listings. */
  gameservers: {
    storagePrefix: 'hivecom:cache:gs:',
    ttl: 30 * 60 * 1000,
    maxEntries: 50,
  },
  /** Community projects. */
  projects: {
    storagePrefix: 'hivecom:cache:pr:',
    ttl: 60 * 60 * 1000,
    maxEntries: 100,
  },
  /** Community metadata. */
  community: {
    storagePrefix: 'hivecom:cache:co:',
    ttl: 10 * 60 * 1000,
    maxEntries: 100,
  },
  /** Discussion threads. */
  discussions: {
    storagePrefix: 'hivecom:cache:di:',
    ttl: 3 * 60 * 1000,
    maxEntries: 200,
  },
  /** Discussion replies. */
  replies: {
    storagePrefix: 'hivecom:cache:re:',
    ttl: 3 * 60 * 1000,
    maxEntries: 500,
  },
  /** User profiles. */
  profiles: {
    storagePrefix: 'hivecom:cache:pf:',
    ttl: 10 * 60 * 1000,
    maxEntries: 200,
  },
  /** User badges. */
  badges: {
    storagePrefix: 'hivecom:cache:ba:',
    ttl: 10 * 60 * 1000,
    maxEntries: 200,
  },
  /** Community themes. */
  themes: {
    storagePrefix: 'hivecom:cache:tm:',
    ttl: 10 * 60 * 1000,
    maxEntries: 100,
  },
  /** Referendums / votes - paginated lists and vote counts. */
  votes: {
    storagePrefix: 'hivecom:cache:vo:',
    ttl: 3 * 60 * 1000,
    maxEntries: 100,
  },
  /** Event RSVPs - counts and user status. Short TTL since they change on interaction. */
  rsvps: {
    storagePrefix: 'hivecom:cache:rv:',
    ttl: 2 * 60 * 1000,
    maxEntries: 300,
  },
} satisfies Record<string, CacheConfig>
