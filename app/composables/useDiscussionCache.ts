/**
 * Caches base `discussions` rows (no joins) under id, slug and entity keys, so
 * any lookup path hits after one fetch. Callers that fetch joined data warm it
 * by passing the base row to `set()`.
 */

import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { readonly } from 'vue'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'
import { useCacheModule } from './useCacheModule'

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

  entityId?: string
}

export function useDiscussionCache() {
  const { cache, loading, error, withCache, onExternalInvalidation } = useCacheModule(CACHE_NAMESPACES.discussions)
  const supabase = useSupabaseClient<Database>()

  // ---------------------------------------------------------------------------
  // Cache primitives
  // ------------------------------------------------------------------------
  function getById(id: string): Tables<'discussions'> | null {
    return cache.get<Tables<'discussions'>>(idKey(id))
  }

  function getBySlug(slug: string): Tables<'discussions'> | null {
    return cache.get<Tables<'discussions'>>(slugKey(slug))
  }

  function getByEntity(type: string, entityId: string): Tables<'discussions'> | null {
    return cache.get<Tables<'discussions'>>(entityKey(type, entityId))
  }

  function set(discussion: Tables<'discussions'>, options: SetDiscussionOptions = {}): void {
    cache.set(idKey(discussion.id), discussion)
    if (discussion.slug != null) {
      cache.set(slugKey(discussion.slug), discussion)
    }
    if (options.entityType != null && options.entityId != null) {
      cache.set(entityKey(options.entityType, options.entityId), discussion)
    }
  }

  /**
   * Use for partial projections, so a full cached row (markdown and joins) is
   * never replaced by a stripped one that blanks the content on the next visit.
   */
  function setIfAbsent(discussion: Tables<'discussions'>, options: SetDiscussionOptions = {}): void {
    if (cache.has(idKey(discussion.id)))
      return

    set(discussion, options)
  }

  /** Pass slug and entity when known so every key gets cleared. */
  function invalidate(id: string, slug?: string | null, entityType?: string, entityId?: string): void {
    cache.delete(idKey(id))
    if (slug != null) {
      cache.delete(slugKey(slug))
    }
    if (entityType != null && entityId != null) {
      cache.delete(entityKey(entityType, entityId))
    }
  }

  function invalidateAll(): void {
    cache.invalidateByPattern('discussion:')
  }

  // ---------------------------------------------------------------------------
  // Fetch helpers
  // ------------------------------------------------------------------------
  async function fetchByEntity(type: string, entityId: string, force = false): Promise<Tables<'discussions'> | null> {
    return withCache(entityKey(type, entityId), async () => {
      const { data, error: fetchError } = await supabase
        .from('discussions')
        .select('*')
        .eq(`${type}_id` as 'id', entityId)
        .maybeSingle()

      if (fetchError)
        throw fetchError

      if (data == null)
        return null

      const row = data as Tables<'discussions'>
      cache.set(idKey(row.id), row)
      if (row.slug != null)
        cache.set(slugKey(row.slug), row)
      return row
    }, { force })
  }

  async function fetchById(id: string, force = false): Promise<Tables<'discussions'> | null> {
    return withCache(idKey(id), async () => {
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
      if (row.slug != null)
        cache.set(slugKey(row.slug), row)
      return row
    }, { force })
  }

  async function fetchBySlug(slug: string, force = false): Promise<Tables<'discussions'> | null> {
    return withCache(slugKey(slug), async () => {
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
      cache.set(idKey(row.id), row)
      return row
    }, { force })
  }

  async function refresh(id: string): Promise<Tables<'discussions'> | null> {
    return fetchById(id, true)
  }

  async function refreshBySlug(slug: string): Promise<Tables<'discussions'> | null> {
    return fetchBySlug(slug, true)
  }

  async function refreshByEntity(type: string, entityId: string): Promise<Tables<'discussions'> | null> {
    return fetchByEntity(type, entityId, true)
  }

  onExternalInvalidation((_key) => {
    // No-op on purpose. Discussions are short-TTL, so cross-tab invalidation
    // isn't worth mapping the key back to an entry.
  })

  // ------------------------------------------------------------------------
  return {
    loading,
    error: readonly(error),

    getById,
    getBySlug,
    getByEntity,
    set,
    setIfAbsent,
    invalidate,
    invalidateAll,

    fetchById,
    fetchBySlug,
    fetchByEntity,
    refresh,
    refreshBySlug,
    refreshByEntity,
  }
}
