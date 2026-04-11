/**
 * Per-record discussion cache composable.
 *
 * Caches individual `discussions` rows by ID, slug, and entity type+id with a
 * 3-minute TTL, consistent with the expected freshness of live discussion data.
 *
 * Design notes:
 * - Stores the base `Tables<'discussions'>` row (no joined relations).
 *   Callers that need joined data (e.g. forum/[id].vue with profile/project/etc.)
 *   fetch their own enriched type and call `set()` with the base row to warm
 *   the cache as a side effect.
 * - `set()` writes three cache keys atomically: `discussion:id:${id}`,
 *   `discussion:slug:${slug}` (if slug present), and
 *   `discussion:entity:${type}:${entityId}` (if entityId present).
 *   Any of the three lookup paths will be a cache hit after one fetch.
 * - `ProfileDiscussions.vue` fetches a batch projection (id, title, slug only)
 *   and calls `set()` for each resolved row, so subsequent Discussion.vue
 *   renders of the same discussion are cache hits.
 * - `invalidate(id, slug?, entityType?, entityId?)` removes all known keys atomically.
 * - `refresh*(...)` helpers force a cache-busting re-fetch and return the updated record.
 *
 * TTL: 3 minutes - discussion content can change (edits, lock/delete status),
 * so we don't cache aggressively. Matches ProfileDiscussions.vue TTL.
 *
 * Call sites that should migrate to this composable:
 * - components/Discussions/Discussion.vue (fetches base row by entity type/id)
 * - pages/forum/[id].vue (fetches base row + joins by slug/id)
 */

import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { readonly, ref } from 'vue'
import { useCache } from './useCache'

const CACHE_TTL = 3 * 60 * 1000 // 3 minutes

function idKey(id: string): string {
  return `discussion:id:${id}`
}

function slugKey(slug: string): string {
  return `discussion:slug:${slug}`
}

function entityKey(type: string, entityId: string): string {
  return `discussion:entity:${type}:${entityId}`
}

export interface SetDiscussionOptions {
  /** Entity type that owns this discussion (e.g. 'event', 'referendum', 'gameserver'). */
  entityType?: string
  /** The entity's ID (e.g. the event UUID). */
  entityId?: string
}

export function useDiscussionCache() {
  const cache = useCache({ ttl: CACHE_TTL })
  const supabase = useSupabaseClient<Database>()

  const loading = ref(false)
  const error = ref<string | null>(null)

  // ---------------------------------------------------------------------------
  // Cache primitives
  // ---------------------------------------------------------------------------

  /**
   * Read a cached discussion by ID. Returns null if cold or expired.
   */
  function getById(id: string): Tables<'discussions'> | null {
    return cache.get<Tables<'discussions'>>(idKey(id))
  }

  /**
   * Read a cached discussion by slug. Returns null if cold or expired.
   */
  function getBySlug(slug: string): Tables<'discussions'> | null {
    return cache.get<Tables<'discussions'>>(slugKey(slug))
  }

  /**
   * Read a cached discussion by entity type + entity ID.
   * Returns null if cold or expired.
   *
   * Example: `getByEntity('event', eventId)`
   */
  function getByEntity(type: string, entityId: string): Tables<'discussions'> | null {
    return cache.get<Tables<'discussions'>>(entityKey(type, entityId))
  }

  /**
   * Populate (or update) the cache for a discussion. Writes up to three keys:
   * - `discussion:id:${id}` (always)
   * - `discussion:slug:${slug}` (when slug is present)
   * - `discussion:entity:${entityType}:${entityId}` (when options are provided)
   *
   * Call this as a side effect whenever you fetch a discussions row elsewhere
   * (e.g. ProfileDiscussions batch query, forum/[id].vue joined fetch) so that
   * subsequent Discussion.vue renders don't need to re-fetch.
   */
  function set(discussion: Tables<'discussions'>, options: SetDiscussionOptions = {}): void {
    cache.set(idKey(discussion.id), discussion, CACHE_TTL)
    if (discussion.slug != null) {
      cache.set(slugKey(discussion.slug), discussion, CACHE_TTL)
    }
    if (options.entityType != null && options.entityId != null) {
      cache.set(entityKey(options.entityType, options.entityId), discussion, CACHE_TTL)
    }
  }

  /**
   * Populate the cache for a discussion only when no valid entry exists yet.
   * Use this when writing partial projections (e.g. from the forum index or
   * profile discussions batch query) so that a full row already in the cache
   * (written by forum/[id].vue with markdown + joins) is never overwritten with
   * a stripped row that would cause the content to disappear on the next visit.
   */
  function setIfAbsent(discussion: Tables<'discussions'>, options: SetDiscussionOptions = {}): void {
    if (cache.has(idKey(discussion.id)))
      return
    set(discussion, options)
  }

  /**
   * Remove cached entries for a discussion. Pass optional slug, entityType,
   * and entityId when known to ensure all keys are cleared atomically.
   */
  function invalidate(id: string, slug?: string | null, entityType?: string, entityId?: string): void {
    cache.delete(idKey(id))
    if (slug != null) {
      cache.delete(slugKey(slug))
    }
    if (entityType != null && entityId != null) {
      cache.delete(entityKey(entityType, entityId))
    }
  }

  /**
   * Remove all discussion cache entries (e.g. after a bulk admin operation).
   */
  function invalidateAll(): void {
    cache.invalidateByPattern('discussion:')
  }

  // ---------------------------------------------------------------------------
  // Fetch helpers
  // ---------------------------------------------------------------------------

  /**
   * Fetch the base discussions row by entity type + entity ID, consulting the
   * cache first. Sets all three cache keys on success.
   *
   * Example: `fetchByEntity('event', eventId)`
   */
  async function fetchByEntity(type: string, entityId: string, force = false): Promise<Tables<'discussions'> | null> {
    if (!force) {
      const cached = getByEntity(type, entityId)
      if (cached !== null)
        return cached
    }

    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('discussions')
        .select('*')
        .eq(`${type}_id`, entityId)
        .maybeSingle()

      if (fetchError)
        throw fetchError

      if (data == null)
        return null

      const row = data as Tables<'discussions'>
      set(row, { entityType: type, entityId })
      return row
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch discussion'
      return null
    }
    finally {
      loading.value = false
    }
  }

  /**
   * Fetch the base discussions row by ID, consulting the cache first.
   * Sets both cache keys on success.
   */
  async function fetchById(id: string, force = false): Promise<Tables<'discussions'> | null> {
    if (!force) {
      const cached = getById(id)
      if (cached !== null)
        return cached
    }

    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('discussions')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (fetchError)
        throw fetchError

      if (data == null)
        return null

      const row = data as Tables<'discussions'>
      set(row)
      return row
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch discussion'
      return null
    }
    finally {
      loading.value = false
    }
  }

  /**
   * Fetch the base discussions row by slug, consulting the cache first.
   * Sets both cache keys on success.
   */
  async function fetchBySlug(slug: string, force = false): Promise<Tables<'discussions'> | null> {
    if (!force) {
      const cached = getBySlug(slug)
      if (cached !== null)
        return cached
    }

    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('discussions')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()

      if (fetchError)
        throw fetchError

      if (data == null)
        return null

      const row = data as Tables<'discussions'>
      set(row)
      return row
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch discussion'
      return null
    }
    finally {
      loading.value = false
    }
  }

  /**
   * Force a re-fetch by ID, bypassing and replacing the cached entry.
   */
  async function refresh(id: string): Promise<Tables<'discussions'> | null> {
    return fetchById(id, true)
  }

  /**
   * Force a re-fetch by slug, bypassing and replacing the cached entry.
   */
  async function refreshBySlug(slug: string): Promise<Tables<'discussions'> | null> {
    return fetchBySlug(slug, true)
  }

  /**
   * Force a re-fetch by entity type + entity ID, bypassing and replacing the cached entry.
   */
  async function refreshByEntity(type: string, entityId: string): Promise<Tables<'discussions'> | null> {
    return fetchByEntity(type, entityId, true)
  }

  // ---------------------------------------------------------------------------

  return {
    // State
    loading: readonly(loading),
    error: readonly(error),

    // Cache primitives
    getById,
    getBySlug,
    getByEntity,
    set,
    setIfAbsent,
    invalidate,
    invalidateAll,

    // Fetch helpers
    fetchById,
    fetchBySlug,
    fetchByEntity,
    refresh,
    refreshBySlug,
    refreshByEntity,
  }
}
