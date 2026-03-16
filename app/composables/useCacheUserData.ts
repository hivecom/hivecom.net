/**
 * Cached user data composable
 * Provides efficient caching for user profile and role data
 */

import type { Ref } from 'vue'
import type { CacheConfig } from './useCache'
import type { Database } from '@/types/database.types'
import { computed, readonly, ref, unref, watch } from 'vue'
import { getUserAvatarUrl } from '@/lib/storage'
import { useCache } from './useCache'

type ProfileBadgeSlug = Database['public']['Enums']['profile_badge']

export interface UserDisplayData {
  id: string
  username: string
  username_set: boolean
  role: string | null
  avatarUrl: string | null
  supporter_lifetime: boolean
  supporter_patreon: boolean
  badges: readonly ProfileBadgeSlug[]
  introduction: string | null
  country: string | null
  created_at: string | null
}

interface ProfileCacheEntry {
  id: string
  username: string
  username_set?: boolean
  supporter_lifetime?: boolean
  supporter_patreon?: boolean
  badges?: ProfileBadgeSlug[]
  introduction?: string | null
  country?: string | null
  created_at?: string | null
}

function hasSupporterMetadata(profile?: ProfileCacheEntry | null): profile is ProfileCacheEntry {
  return (
    typeof profile?.username_set === 'boolean'
    && typeof profile?.supporter_lifetime === 'boolean'
    && typeof profile?.supporter_patreon === 'boolean'
    && Array.isArray(profile?.badges)
  )
}

export interface useCacheUserDataOptions extends CacheConfig {
  includeRole?: boolean
  includeAvatar?: boolean
  userTtl?: number // TTL specifically for user data (default: 10 minutes)
  avatarTtl?: number // TTL for avatar URLs (default: 30 minutes)
}

/**
 * Cached user data composable optimized for UserDisplay components
 */
export function useCacheUserData(userId: string | Ref<string | null | undefined>, options: useCacheUserDataOptions = {}) {
  const {
    includeRole = false,
    includeAvatar = true,
    userTtl = 10 * 60 * 1000, // 10 minutes for user data
    avatarTtl = 30 * 60 * 1000, // 30 minutes for avatars
    ...cacheConfig
  } = options

  const cache = useCache(cacheConfig)
  const supabase = useSupabaseClient<Database>()
  const currentUser = useSupabaseUser()

  const user = ref<UserDisplayData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // In-flight deduplication: if a fetch for a given key is already in progress,
  // subsequent callers attach to the same promise instead of firing a new request.
  const _inflightProfiles = new Map<string, Promise<ProfileCacheEntry | null>>()
  const _inflightRoles = new Map<string, Promise<string | null>>()

  /**
   * Generate cache keys for different data types
   */
  function getCacheKeys(id: string) {
    return {
      profile: `user:profile:${id}`,
      role: `user:role:${id}`,
      avatar: `user:avatar:${id}`,
    }
  }

  /**
   * Fetch user profile data
   */
  async function fetchProfile(id: string) {
    const cacheKey = getCacheKeys(id).profile

    // Check cache first
    let profile = cache.get<ProfileCacheEntry>(cacheKey)
    if (profile && !hasSupporterMetadata(profile)) {
      cache.delete(cacheKey)
      profile = null
    }

    if (!profile) {
      // Coalesce concurrent fetches for the same ID into one request.
      let inflight = _inflightProfiles.get(id)
      if (inflight == null) {
        inflight = Promise.resolve(
          supabase
            .from('profiles')
            .select('id, username, username_set, supporter_lifetime, supporter_patreon, badges, introduction, country, created_at')
            .eq('id', id)
            .single(),
        ).then(({ data, error: profileError }) => {
          if (profileError)
            throw profileError

          const result: ProfileCacheEntry = {
            id: data.id,
            username: data.username || 'Unknown',
            username_set: data.username_set ?? false,
            supporter_lifetime: data.supporter_lifetime ?? false,
            supporter_patreon: data.supporter_patreon ?? false,
            badges: Array.isArray(data.badges) ? [...data.badges] : [],
            introduction: data.introduction ?? null,
            country: data.country ?? null,
            created_at: data.created_at ?? null,
          }

          cache.set(cacheKey, result, userTtl)
          return result
        }).finally(() => {
          _inflightProfiles.delete(id)
        })

        _inflightProfiles.set(id, inflight)
      }

      profile = await inflight
    }

    return profile
  }

  /**
   * Fetch user role data
   */
  async function fetchRole(id: string): Promise<string | null> {
    if (!includeRole)
      return null

    const cacheKey = getCacheKeys(id).role

    // Don't fetch role when unauthenticated - RLS will block the query and
    // the null result would be cached, preventing the role from loading after sign-in.
    if (!currentUser.value)
      return null

    // Check cache first
    const hasCachedRole = cache.has(cacheKey)

    if (!hasCachedRole) {
      // Coalesce concurrent fetches for the same ID into one request.
      let inflight = _inflightRoles.get(id)
      if (inflight == null) {
        inflight = Promise.resolve(
          supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', id)
            .maybeSingle(),
        ).then(({ data }) => {
          const role = data?.role ?? null
          cache.set(cacheKey, role, userTtl)
          return role
        }).finally(() => {
          _inflightRoles.delete(id)
        })

        _inflightRoles.set(id, inflight)
      }

      return inflight
    }

    // Return cached value (could be null if user has no role)
    return cache.get<string | null>(cacheKey)
  }

  /**
   * Fetch user avatar URL
   */
  async function fetchAvatarUrl(id: string): Promise<string | null> {
    if (!includeAvatar)
      return null

    // Don't attempt to fetch avatars when the user is not authenticated –
    // RLS will block the storage list call and the null result would be
    // cached, preventing the avatar from loading once the user signs in.
    if (!currentUser.value)
      return null

    const cacheKey = getCacheKeys(id).avatar

    // Check cache first
    const hasCachedAvatar = cache.has(cacheKey)

    if (!hasCachedAvatar) {
      // Fetch from storage
      let avatarUrl: string | null = null
      try {
        avatarUrl = await getUserAvatarUrl(supabase, id)
      }
      catch (err) {
        console.warn('Failed to fetch avatar URL:', err)
        avatarUrl = null
      }

      // Cache the result
      cache.set(cacheKey, avatarUrl, avatarTtl)

      return avatarUrl
    }

    // Return cached value (could be null if user has no avatar)
    return cache.get<string | null>(cacheKey)
  }

  /**
   * Fetch all user data
   */
  async function fetchUserData(force = false): Promise<void> {
    const id = unref(userId)

    if (id === null || id === undefined || id.trim() === '') {
      user.value = null
      return
    }

    // Clear cache if forced
    if (force) {
      const keys = getCacheKeys(id)
      cache.delete(keys.profile)
      cache.delete(keys.role)
      cache.delete(keys.avatar)
    }

    loading.value = true
    error.value = null

    try {
      // Fetch all data in parallel
      const [profile, role, avatarUrl] = await Promise.all([
        fetchProfile(id),
        fetchRole(id),
        fetchAvatarUrl(id),
      ])

      user.value = profile != null
        ? {
            id: profile.id,
            username: profile.username,
            username_set: profile.username_set ?? false,
            role,
            avatarUrl,
            supporter_lifetime: profile.supporter_lifetime ?? false,
            supporter_patreon: profile.supporter_patreon ?? false,
            badges: profile.badges ? [...profile.badges] : [],
            introduction: profile.introduction ?? null,
            country: profile.country ?? null,
            created_at: profile.created_at ?? null,
          }
        : null
    }
    catch (err) {
      console.error('Failed to fetch user data:', err)
      error.value = err instanceof Error ? err.message : 'Failed to fetch user data'
      user.value = null
    }
    finally {
      loading.value = false
    }
  }

  /**
   * Refetch user data (bypasses cache)
   */
  async function refetch(): Promise<void> {
    await fetchUserData(true)
  }

  /**
   * Invalidate cache for this user
   */
  function invalidateUser(): void {
    const id = unref(userId)
    if (id === null || id === undefined || id.trim() === '')
      return

    const keys = getCacheKeys(id)
    cache.delete(keys.profile)
    cache.delete(keys.role)
    cache.delete(keys.avatar)
  }

  /**
   * Invalidate cache for all users (useful after bulk operations)
   */
  function invalidateAllUsers(): void {
    cache.invalidateByPattern('user:')
  }

  // Watch for userId changes
  watch(() => unref(userId), () => {
    void fetchUserData()
  }, { immediate: true })

  // Watch for authentication changes - force refetch on sign-in to bust any
  // stale null-cached role/avatar data that may have been stored pre-auth.
  watch(currentUser, (newUser) => {
    void fetchUserData(newUser != null)
  })

  // Computed helpers
  const userInitials = computed(() => {
    if (user.value?.username === null || user.value?.username === undefined || user.value?.username.trim() === '')
      return '?'

    return user.value.username
      .split(' ')
      .map((word: string) => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2)
  })

  const hasRole = computed(() => {
    return includeRole && user.value?.role !== null
  })

  return {
    // Data
    user: readonly(user),
    loading: readonly(loading),
    error: readonly(error),

    // Computed helpers
    userInitials: readonly(userInitials),
    hasRole: readonly(hasRole),

    // Methods
    refetch,
    invalidateUser,
    invalidateAllUsers,

    // Direct access to cache for advanced use cases
    cache,
  }
}

/**
 * Bulk user data loader for efficiency when loading multiple users
 */
export function useBulkUserData(userIds: Ref<string[]>, options: useCacheUserDataOptions = {}) {
  const {
    includeRole = false,
    includeAvatar = true,
    userTtl = 10 * 60 * 1000,
    avatarTtl = 30 * 60 * 1000,
    ...cacheConfig
  } = options

  const cache = useCache(cacheConfig)
  const supabase = useSupabaseClient<Database>()
  const currentUser = useSupabaseUser()

  const users = ref<Map<string, UserDisplayData>>(new Map())
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Fetch multiple users efficiently
   */
  async function fetchUsers(force = false): Promise<void> {
    const ids = unref(userIds)

    if (ids.length === 0) {
      users.value.clear()
      return
    }

    if (force) {
      ids.forEach((id) => {
        cache.delete(`user:profile:${id}`)
        if (includeRole) {
          cache.delete(`user:role:${id}`)
        }
        if (includeAvatar) {
          cache.delete(`user:avatar:${id}`)
        }
      })
    }

    loading.value = true
    error.value = null

    try {
      const profileIdsToFetch = ids.filter((id) => {
        const cacheKey = `user:profile:${id}`
        const cachedProfile = cache.get<ProfileCacheEntry>(cacheKey)
        if (!cachedProfile)
          return true

        if (!hasSupporterMetadata(cachedProfile)) {
          cache.delete(cacheKey)
          return true
        }

        return false
      })
      const roleIdsToFetch = includeRole ? ids.filter(id => !cache.has(`user:role:${id}`)) : []
      // Don't attempt to fetch avatars when the user is not authenticated –
      // RLS will block the storage list call and the null result would be
      // cached, preventing avatars from loading once the user signs in.
      const avatarIdsToFetch = includeAvatar && currentUser.value ? ids.filter(id => !cache.has(`user:avatar:${id}`)) : []

      const [profileResults, roleResults] = await Promise.all([
        profileIdsToFetch.length > 0
          ? supabase
              .from('profiles')
              .select('id, username, username_set, supporter_lifetime, supporter_patreon, badges, introduction, country, created_at')
              .in('id', profileIdsToFetch)
          : Promise.resolve({ data: [], error: null }),
        includeRole && roleIdsToFetch.length > 0
          ? supabase
              .from('user_roles')
              .select('user_id, role')
              .in('user_id', roleIdsToFetch)
          : Promise.resolve({ data: [], error: null }),
      ])

      if (profileResults.error) {
        throw profileResults.error
      }

      if (roleResults.error) {
        throw roleResults.error
      }

      const profiles = profileResults.data ?? []
      const roles = roleResults.data ?? []

      profiles.forEach((profile) => {
        cache.set(`user:profile:${profile.id}`, {
          id: profile.id,
          username: profile.username ?? 'Unknown',
          username_set: profile.username_set ?? false,
          supporter_lifetime: profile.supporter_lifetime ?? false,
          supporter_patreon: profile.supporter_patreon ?? false,
          badges: Array.isArray(profile.badges) ? [...profile.badges] : [],
          introduction: profile.introduction ?? null,
          country: profile.country ?? null,
          created_at: profile.created_at ?? null,
        }, userTtl)
      })

      if (includeRole) {
        const roleMap = new Map(roles.map(role => [role.user_id, role.role]))
        roleIdsToFetch.forEach((id) => {
          cache.set(`user:role:${id}`, roleMap.get(id) ?? null, userTtl)
        })
      }

      if (includeAvatar && avatarIdsToFetch.length > 0) {
        await Promise.all(avatarIdsToFetch.map(async (id) => {
          try {
            const avatarUrl = await getUserAvatarUrl(supabase, id)
            cache.set(`user:avatar:${id}`, avatarUrl, avatarTtl)
          }
          catch (err) {
            console.warn('Failed to fetch avatar URL for bulk user:', err)
            cache.set(`user:avatar:${id}`, null, avatarTtl)
          }
        }))
      }

      // Build user map from cache and new data
      const userMap = new Map<string, UserDisplayData>()

      for (const id of ids) {
        const profile = cache.get<ProfileCacheEntry>(`user:profile:${id}`)
        const role = includeRole ? cache.get<string | null>(`user:role:${id}`) : null
        const avatarUrl = includeAvatar ? cache.get<string | null>(`user:avatar:${id}`) : null

        if (profile) {
          userMap.set(id, {
            id: profile.id,
            username: profile.username,
            username_set: profile.username_set ?? false,
            role: role ?? null,
            avatarUrl: avatarUrl ?? null,
            supporter_lifetime: profile.supporter_lifetime ?? false,
            supporter_patreon: profile.supporter_patreon ?? false,
            badges: profile.badges ? [...profile.badges] : [],
            introduction: profile.introduction ?? null,
            country: profile.country ?? null,
            created_at: profile.created_at ?? null,
          })
        }
      }

      users.value = userMap
    }
    catch (err) {
      console.error('Failed to fetch bulk user data:', err)
      error.value = err instanceof Error ? err.message : 'Failed to fetch user data'
    }
    finally {
      loading.value = false
    }
  }

  // Watch for userIds changes
  watch(userIds, () => {
    void fetchUsers()
  }, { immediate: true })

  // Watch for authentication changes
  watch(currentUser, () => {
    void fetchUsers()
  })

  return {
    users: readonly(users),
    loading: readonly(loading),
    error: readonly(error),
    refetch: async () => fetchUsers(true),
    cache,
  }
}
