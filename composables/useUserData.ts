/**
 * Cached user data composable
 * Provides efficient caching for user profile and role data
 */

import type { Database } from '@/types/database.types'
import { computed, ref, type Ref, watch } from 'vue'
import { getUserAvatarUrl } from '~/utils/storage'
import { type CacheConfig, useSupabaseCache } from './useSupabaseCache'

export interface UserDisplayData {
  id: string
  username: string
  role: string | null
  avatarUrl: string | null
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
    let profile = cache.get<{ id: string, username: string }>(cacheKey)

    if (!profile) {
      // Fetch from database
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('id', id)
        .single()

      if (profileError) {
        throw profileError
      }

      profile = {
        id: data.id,
        username: data.username || 'Unknown',
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

    if (!id) {
      user.value = null
      return
    }

    // Only fetch if user is authenticated
    if (!currentUser.value) {
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
    if (!id)
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
    fetchUserData()
  }, { immediate: true })

  // Watch for authentication changes
  watch(currentUser, () => {
    fetchUserData()
  })

  // Computed helpers
  const userInitials = computed(() => {
    if (!user.value?.username)
      return '?'

    return user.value.username
      .split(' ')
      .map(word => word.charAt(0))
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
  const cache = useSupabaseCache(options)
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

    if (!currentUser.value) {
      users.value.clear()
      return
    }

    loading.value = true
    error.value = null

    try {
      // Determine which users need to be fetched
      const uncachedIds = force
        ? ids
        : ids.filter((id) => {
            const profileKey = `user:profile:${id}`
            return !cache.has(profileKey)
          })

      let profiles: Array<{ id: string, username: string }> = []
      let roles: Array<{ user_id: string, role: string }> = []

      // Fetch uncached profiles in bulk
      if (uncachedIds.length > 0) {
        const [profileResults, roleResults] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, username')
            .in('id', uncachedIds),
          options.includeRole
            ? supabase
                .from('user_roles')
                .select('user_id, role')
                .in('user_id', uncachedIds)
            : Promise.resolve({ data: [] }),
        ])

        if (profileResults.error) {
          throw profileResults.error
        }

        profiles = profileResults.data ?? []
        roles = roleResults.data ?? []

        // Cache the results
        profiles.forEach((profile) => {
          cache.set(`user:profile:${profile.id}`, profile, options.userTtl)
        })

        roles.forEach((role) => {
          cache.set(`user:role:${role.user_id}`, role.role, options.userTtl)
        })
      }

      // Build user map from cache and new data
      const userMap = new Map<string, UserDisplayData>()

      for (const id of ids) {
        const profile = cache.get<{ id: string, username: string }>(`user:profile:${id}`)
        const role = options.includeRole ? cache.get<string | null>(`user:role:${id}`) : null
        const avatarUrl = options.includeAvatar ? cache.get<string | null>(`user:avatar:${id}`) : null

        if (profile) {
          userMap.set(id, {
            id: profile.id,
            username: profile.username,
            role: role ?? null,
            avatarUrl: avatarUrl ?? null,
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
    fetchUsers()
  }, { immediate: true })

  // Watch for authentication changes
  watch(currentUser, () => {
    fetchUsers()
  })

  return {
    users: readonly(users),
    loading: readonly(loading),
    error: readonly(error),
    refetch: () => fetchUsers(true),
    cache,
  }
}
