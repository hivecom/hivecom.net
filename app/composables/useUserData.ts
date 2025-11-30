/**
 * Cached user data composable
 * Provides efficient caching for user profile and role data
 */

import type { Ref } from 'vue'
import type { CacheConfig } from './useSupabaseCache'
import type { Database } from '@/types/database.types'
import { computed, readonly, ref, unref, watch } from 'vue'
import { getUserAvatarUrl } from '@/lib/utils/storage'
import { useSupabaseCache } from './useSupabaseCache'

export interface UserDisplayData {
  id: string
  username: string
  role: string | null
  avatarUrl: string | null
  supporter_lifetime: boolean
  supporter_patreon: boolean
}

interface ProfileCacheEntry {
  id: string
  username: string
  supporter_lifetime: boolean
  supporter_patreon: boolean
}

export interface UseUserDataOptions extends CacheConfig {
  includeRole?: boolean
  includeAvatar?: boolean
  userTtl?: number // TTL specifically for user data (default: 10 minutes)
  avatarTtl?: number // TTL for avatar URLs (default: 30 minutes)
}

/**
 * Cached user data composable optimized for UserDisplay components
 */
export function useUserData(userId: string | Ref<string | null | undefined>, options: UseUserDataOptions = {}) {
  const {
    includeRole = false,
    includeAvatar = true,
    userTtl = 10 * 60 * 1000, // 10 minutes for user data
    avatarTtl = 30 * 60 * 1000, // 30 minutes for avatars
    ...cacheConfig
  } = options

  const cache = useSupabaseCache(cacheConfig)
  const supabase = useSupabaseClient<Database>()
  const currentUser = useSupabaseUser()

  const user = ref<UserDisplayData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

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

    if (!profile) {
      // Fetch from database
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, supporter_lifetime, supporter_patreon')
        .eq('id', id)
        .single()

      if (profileError) {
        throw profileError
      }

      profile = {
        id: data.id,
        username: data.username || 'Unknown',
        supporter_lifetime: data.supporter_lifetime ?? false,
        supporter_patreon: data.supporter_patreon ?? false,
      }

      // Cache the result
      cache.set(cacheKey, profile, userTtl)
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

    // Check cache first
    const hasCachedRole = cache.has(cacheKey)

    if (!hasCachedRole) {
      // Fetch from database
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', id)
        .single()

      const role = data?.role ?? null

      // Cache the result
      cache.set(cacheKey, role, userTtl)

      return role
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

    // Only fetch if user is authenticated
    if (currentUser.value === null || currentUser.value === undefined) {
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

      user.value = {
        id: profile.id,
        username: profile.username,
        role,
        avatarUrl,
        supporter_lifetime: profile.supporter_lifetime ?? false,
        supporter_patreon: profile.supporter_patreon ?? false,
      }
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

  // Watch for authentication changes
  watch(currentUser, () => {
    void fetchUserData()
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
export function useBulkUserData(userIds: Ref<string[]>, options: UseUserDataOptions = {}) {
  const {
    includeRole = false,
    includeAvatar = true,
    userTtl = 10 * 60 * 1000,
    avatarTtl = 30 * 60 * 1000,
    ...cacheConfig
  } = options

  const cache = useSupabaseCache(cacheConfig)
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

    if (currentUser.value === null || currentUser.value === undefined) {
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
      const profileIdsToFetch = ids.filter(id => !cache.has(`user:profile:${id}`))
      const roleIdsToFetch = includeRole ? ids.filter(id => !cache.has(`user:role:${id}`)) : []
      const avatarIdsToFetch = includeAvatar ? ids.filter(id => !cache.has(`user:avatar:${id}`)) : []

      const [profileResults, roleResults] = await Promise.all([
        profileIdsToFetch.length > 0
          ? supabase
              .from('profiles')
              .select('id, username, supporter_lifetime, supporter_patreon')
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
          supporter_lifetime: profile.supporter_lifetime ?? false,
          supporter_patreon: profile.supporter_patreon ?? false,
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
            role: role ?? null,
            avatarUrl: avatarUrl ?? null,
            supporter_lifetime: profile.supporter_lifetime ?? false,
            supporter_patreon: profile.supporter_patreon ?? false,
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
