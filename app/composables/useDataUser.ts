/**
 * Cached user data composable
 * Provides efficient caching for user profile and role data
 *
 * Key design: inflight deduplication maps are MODULE-SCOPED (global singletons)
 * so that when 30 components mount in the same tick requesting the same user ID,
 * only ONE network request fires. Previous versions had per-instance maps which
 * were completely useless for cross-component dedup.
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
  isPublic: boolean
  has_banner: boolean
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
  isPublic?: boolean
  has_banner?: boolean
}

function hasSupporterMetadata(profile?: ProfileCacheEntry | null): profile is ProfileCacheEntry {
  return (
    typeof profile?.username_set === 'boolean'
    && typeof profile?.supporter_lifetime === 'boolean'
    && typeof profile?.supporter_patreon === 'boolean'
    && Array.isArray(profile?.badges)
  )
}

// ── Global inflight deduplication maps ────────────────────────────────────────
// These are MODULE-SCOPED so every useDataUser instance shares them.
// When component A starts fetching profile for user X, component B (mounting
// in the same tick) attaches to the same promise instead of firing a duplicate
// request. The promise is removed from the map once it settles.
const _inflightProfiles = new Map<string, Promise<ProfileCacheEntry | null>>()
const _inflightRoles = new Map<string, Promise<string | null>>()
const _inflightAvatars = new Map<string, Promise<string | null>>()

// ── Shared cache key helpers ──────────────────────────────────────────────────
function getCacheKeys(id: string) {
  return {
    profile: `user:profile:${id}`,
    role: `user:role:${id}`,
    avatar: `user:avatar:${id}`,
  }
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
export function useDataUser(userId: string | Ref<string | null | undefined>, options: useCacheUserDataOptions = {}) {
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

  /**
   * Fetch user profile data with global inflight dedup
   */
  async function fetchProfile(id: string): Promise<ProfileCacheEntry | null> {
    const cacheKey = getCacheKeys(id).profile

    // Check cache first
    let profile = cache.get<ProfileCacheEntry>(cacheKey)
    if (profile && !hasSupporterMetadata(profile)) {
      cache.delete(cacheKey)
      profile = null
    }

    if (profile) {
      return profile
    }

    // Coalesce concurrent fetches across ALL component instances
    let inflight = _inflightProfiles.get(id)
    if (inflight == null) {
      inflight = Promise.resolve(
        supabase
          .from('profiles')
          .select('id, username, username_set, supporter_lifetime, supporter_patreon, badges, introduction, country, created_at, public, has_banner')
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
          isPublic: data.public ?? false,
          has_banner: data.has_banner ?? false,
        }

        cache.set(cacheKey, result, userTtl)
        return result
      }).finally(() => {
        _inflightProfiles.delete(id)
      })

      _inflightProfiles.set(id, inflight)
    }

    return inflight
  }

  /**
   * Fetch user role data with global inflight dedup
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
    if (cache.has(cacheKey)) {
      return cache.get<string | null>(cacheKey)
    }

    // Coalesce concurrent fetches across ALL component instances
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

  /**
   * Fetch user avatar URL with global inflight dedup
   */
  async function fetchAvatarUrl(id: string): Promise<string | null> {
    if (!includeAvatar)
      return null

    // Don't attempt to fetch avatars when the user is not authenticated -
    // RLS will block the storage list call and the null result would be
    // cached, preventing the avatar from loading once the user signs in.
    if (!currentUser.value)
      return null

    const cacheKey = getCacheKeys(id).avatar

    // Check cache first
    if (cache.has(cacheKey)) {
      return cache.get<string | null>(cacheKey)
    }

    // Coalesce concurrent fetches across ALL component instances
    let inflight = _inflightAvatars.get(id)
    if (inflight == null) {
      inflight = (async () => {
        let avatarUrl: string | null = null
        try {
          avatarUrl = await getUserAvatarUrl(supabase, id)
        }
        catch (err) {
          console.warn('Failed to fetch avatar URL:', err)
          avatarUrl = null
        }

        cache.set(cacheKey, avatarUrl, avatarTtl)
        return avatarUrl
      })().finally(() => {
        _inflightAvatars.delete(id)
      })

      _inflightAvatars.set(id, inflight)
    }

    return inflight
  }

  /**
   * Fetch all user data, reading from cache or deduped inflight requests
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

    // Only show loading if we don't already have data for this user.
    // This prevents the skeleton flash on back-navigation when cache is warm.
    const hadData = user.value?.id === id
    if (!hadData) {
      loading.value = true
    }
    error.value = null

    try {
      // Fetch all data in parallel - each sub-fetch deduplicates globally
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
            isPublic: profile.isPublic ?? false,
            has_banner: profile.has_banner ?? false,
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

  // Watch for authentication changes.
  // Only force-refetch when the user SIGNS IN (transition from null to non-null).
  // This busts stale null-cached role/avatar data from pre-auth.
  // We do NOT refetch on sign-out or on navigation (where currentUser briefly
  // flickers) - that was causing the skeleton flash and anonymous username issue.
  let _wasAuthed = false
  watch(currentUser, (newUser) => {
    const isAuthed = newUser != null
    const justSignedIn = !_wasAuthed && isAuthed
    _wasAuthed = isAuthed

    // Only react to actual sign-in (was null, now has a user)
    if (justSignedIn) {
      void fetchUserData(true)
    }
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
 * Bulk user data loader for efficiency when loading multiple users.
 * Uses the same global cache and inflight maps, so individual useDataUser
 * calls that race with a bulk load will attach to the same promises.
 */
export function useBulkDataUser(userIds: Ref<string[]>, options: useCacheUserDataOptions = {}) {
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
   * Fetch multiple users efficiently.
   * Profiles and roles that aren't cached are fetched in bulk IN(...) queries.
   * The results are written to the same global cache that useDataUser reads,
   * so individual component mounts will get cache hits.
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
      const roleIdsToFetch = includeRole && currentUser.value
        ? ids.filter(id => !cache.has(`user:role:${id}`))
        : []
      // Don't attempt to fetch avatars when the user is not authenticated -
      // RLS will block the storage list call and the null result would be
      // cached, preventing avatars from loading once the user signs in.
      const avatarIdsToFetch = includeAvatar && currentUser.value ? ids.filter(id => !cache.has(`user:avatar:${id}`)) : []

      const [profileResults, roleResults] = await Promise.all([
        profileIdsToFetch.length > 0
          ? supabase
              .from('profiles')
              .select('id, username, username_set, supporter_lifetime, supporter_patreon, badges, introduction, country, created_at, public, has_banner')
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
          isPublic: profile.public ?? false,
          has_banner: profile.has_banner ?? false,
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
          // Use the global inflight map so individual useDataUser calls
          // that happen to fire for these same IDs will piggyback.
          const cacheKey = `user:avatar:${id}`
          let inflight = _inflightAvatars.get(id)
          if (inflight == null) {
            inflight = (async () => {
              let avatarUrl: string | null = null
              try {
                avatarUrl = await getUserAvatarUrl(supabase, id)
              }
              catch (err) {
                console.warn('Failed to fetch avatar URL for bulk user:', err)
                avatarUrl = null
              }
              cache.set(cacheKey, avatarUrl, avatarTtl)
              return avatarUrl
            })().finally(() => {
              _inflightAvatars.delete(id)
            })

            _inflightAvatars.set(id, inflight)
          }

          await inflight
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
            isPublic: profile.isPublic ?? false,
            has_banner: profile.has_banner ?? false,
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

  // Watch for userIds changes - compare by serialised content, not by array
  // reference, so a new array with the same IDs (e.g. produced by .map() in
  // the parent on every render) doesn't trigger an unnecessary fetchUsers /
  // userMap rebuild.  Cache hits make the rebuild cheap, but avoiding it
  // entirely is cleaner.
  watch(
    () => unref(userIds).join(','),
    () => {
      void fetchUsers()
    },
    { immediate: true },
  )

  // Watch for authentication changes - same logic as useDataUser:
  // only refetch on actual sign-in transition
  let _wasAuthed = false
  watch(currentUser, (newUser) => {
    const isAuthed = newUser != null
    const justSignedIn = !_wasAuthed && isAuthed
    _wasAuthed = isAuthed

    if (justSignedIn) {
      void fetchUsers(true)
    }
  })

  return {
    users: readonly(users),
    loading: readonly(loading),
    error: readonly(error),
    refetch: async () => fetchUsers(true),
    cache,
  }
}
