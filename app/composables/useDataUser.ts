import type { Ref } from 'vue'
import type { CacheConfig } from './useCache'
import type { Database } from '@/types/database.types'
import { computed, getCurrentInstance, onUnmounted, readonly, ref, unref, watch } from 'vue'
import { getUserAvatarUrl } from '@/lib/storage'
import { useAvatarBus } from './useAvatarBus'
import { useCache } from './useCache'

export interface UserDisplayData {
  id: string
  username: string
  username_set: boolean
  role: string | null
  avatarUrl: string | null
  supporter_lifetime: boolean
  supporter_patreon: boolean
  introduction: string | null
  country: string | null
  created_at: string | null
  isPublic: boolean
  has_banner: boolean
  banner_extension: string | null
  last_seen: string | null
}

interface ProfileCacheEntry {
  id: string
  username: string
  username_set?: boolean
  supporter_lifetime?: boolean
  supporter_patreon?: boolean
  introduction?: string | null
  country?: string | null
  created_at?: string | null
  isPublic?: boolean
  has_banner?: boolean
  avatar_extension?: string | null
  banner_extension?: string | null
  last_seen?: string | null
}

function hasSupporterMetadata(profile?: ProfileCacheEntry | null): profile is ProfileCacheEntry {
  return (
    typeof profile?.username_set === 'boolean'
    && typeof profile?.supporter_lifetime === 'boolean'
    && typeof profile?.supporter_patreon === 'boolean'
  )
}

// ── Global inflight deduplication maps ────────────────────────────────────────
// Module-scoped so components mounting in the same tick for the same user share
// one request instead of each firing their own.
const _inflightProfiles = new Map<string, Promise<ProfileCacheEntry | null>>()
const _inflightRoles = new Map<string, Promise<string | null>>()
const _inflightAvatars = new Map<string, Promise<string | null>>()

// ── Module-level avatar-updated bus ──────────────────────────────────────────
// Active instances by userId, so an avatar update refetches everywhere at once.
const _activeInstances = new Map<string, Set<() => Promise<void>>>()

if (typeof window !== 'undefined') {
  const { onAvatarUpdated } = useAvatarBus()
  onAvatarUpdated(({ userId }) => {
    // Don't call invalidateAvatarCache here. uploadUserAvatar already stored the
    // cache-busted URL, and deleting it makes getUserAvatarUrl rebuild the clean
    // URL (no ?t=), which sends the browser back to its HTTP-cached old image.
    const instances = _activeInstances.get(userId)
    if (instances) {
      for (const refetch of instances) {
        void refetch()
      }
    }
  })
}

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
  userTtl?: number // ms, default 10 minutes
  avatarTtl?: number // ms, default 30 minutes
}

export function useDataUser(userId: string | Ref<string | null | undefined>, options: useCacheUserDataOptions = {}) {
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

  const user = ref<UserDisplayData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Seeds synchronously so a re-mount has the avatar right away instead of flashing.
  function seedFromCache(id: string): void {
    const keys = getCacheKeys(id)
    const profile = cache.get<ProfileCacheEntry>(keys.profile)
    if (!profile || !hasSupporterMetadata(profile))
      return
    if (includeRole && !cache.has(keys.role))
      return
    if (includeAvatar && !cache.has(keys.avatar))
      return

    const role = includeRole ? cache.get<string | null>(keys.role) : null
    const avatarUrl = includeAvatar ? cache.get<string | null>(keys.avatar) : null

    user.value = {
      id: profile.id,
      username: profile.username,
      username_set: profile.username_set ?? false,
      role: role ?? null,
      avatarUrl: avatarUrl ?? null,
      supporter_lifetime: profile.supporter_lifetime ?? false,
      supporter_patreon: profile.supporter_patreon ?? false,
      introduction: profile.introduction ?? null,
      country: profile.country ?? null,
      created_at: profile.created_at ?? null,
      isPublic: profile.isPublic ?? false,
      has_banner: profile.has_banner ?? false,
      banner_extension: profile.banner_extension ?? null,
      last_seen: profile.last_seen ?? null,
    }
  }

  async function fetchProfile(id: string): Promise<ProfileCacheEntry | null> {
    const cacheKey = getCacheKeys(id).profile

    let profile = cache.get<ProfileCacheEntry>(cacheKey)
    if (profile && !hasSupporterMetadata(profile)) {
      cache.delete(cacheKey)
      profile = null
    }

    if (profile) {
      return profile
    }

    let inflight = _inflightProfiles.get(id)
    if (inflight == null) {
      inflight = Promise.resolve(
        supabase
          .from('profiles')
          .select('id, username, username_set, supporter_lifetime, supporter_patreon, introduction, country, created_at, public, has_banner, avatar_extension, banner_extension, last_seen')
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
          introduction: data.introduction ?? null,
          country: data.country ?? null,
          created_at: data.created_at ?? null,
          isPublic: data.public ?? false,
          has_banner: data.has_banner ?? false,
          avatar_extension: data.avatar_extension ?? null,
          banner_extension: data.banner_extension ?? null,
          last_seen: data.last_seen ?? null,
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

  async function fetchRole(id: string): Promise<string | null> {
    if (!includeRole)
      return null

    const cacheKey = getCacheKeys(id).role

    // Don't fetch unauthenticated. RLS blocks the query and the cached null
    // would keep the role from loading after sign-in.
    if (!currentUser.value)
      return null

    if (cache.has(cacheKey)) {
      return cache.get<string | null>(cacheKey)
    }

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

  async function fetchAvatarUrl(id: string, avatarExtension?: string | null): Promise<string | null> {
    if (!includeAvatar)
      return null

    // Don't fetch unauthenticated. RLS blocks the storage list call and the
    // cached null would keep the avatar from loading after sign-in.
    if (!currentUser.value)
      return null

    const cacheKey = getCacheKeys(id).avatar

    if (cache.has(cacheKey)) {
      return cache.get<string | null>(cacheKey)
    }

    let inflight = _inflightAvatars.get(id)
    if (inflight == null) {
      inflight = (async () => {
        let avatarUrl: string | null = null
        try {
          avatarUrl = await getUserAvatarUrl(supabase, id, avatarExtension)
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

  async function fetchUserData(force = false): Promise<void> {
    const id = unref(userId)

    if (id === null || id === undefined || id.trim() === '') {
      user.value = null
      return
    }

    if (force) {
      const keys = getCacheKeys(id)
      cache.delete(keys.profile)
      cache.delete(keys.role)
      cache.delete(keys.avatar)
    }

    // Only show loading without data for this user, so a warm back-navigation
    // doesn't flash a skeleton.
    const hadData = user.value?.id === id
    if (!hadData) {
      loading.value = true
    }
    error.value = null

    try {
      // The avatar waits for the profile's extension hint.
      const [profile, role] = await Promise.all([fetchProfile(id), fetchRole(id)])
      const avatarUrl = await fetchAvatarUrl(id, profile?.avatar_extension)

      user.value = profile != null
        ? {
            id: profile.id,
            username: profile.username,
            username_set: profile.username_set ?? false,
            role,
            avatarUrl,
            supporter_lifetime: profile.supporter_lifetime ?? false,
            supporter_patreon: profile.supporter_patreon ?? false,
            introduction: profile.introduction ?? null,
            country: profile.country ?? null,
            created_at: profile.created_at ?? null,
            isPublic: profile.isPublic ?? false,
            has_banner: profile.has_banner ?? false,
            banner_extension: profile.banner_extension ?? null,
            last_seen: profile.last_seen ?? null,
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

  async function refetch(): Promise<void> {
    await fetchUserData(true)
  }

  function invalidateUser(): void {
    const id = unref(userId)
    if (id === null || id === undefined || id.trim() === '')
      return

    const keys = getCacheKeys(id)
    cache.delete(keys.profile)
    cache.delete(keys.role)
    cache.delete(keys.avatar)
  }

  function invalidateAllUsers(): void {
    cache.invalidateByPattern('user:')
  }

  // Registered so the avatar-updated bus can force-refetch this instance.
  watch(() => unref(userId), (newId, oldId) => {
    if (oldId != null && oldId !== '') {
      const set = _activeInstances.get(oldId)
      if (set) {
        set.delete(refetch)
        if (set.size === 0)
          _activeInstances.delete(oldId)
      }
    }
    if (newId != null && newId !== '') {
      if (!_activeInstances.has(newId))
        _activeInstances.set(newId, new Set())
      _activeInstances.get(newId)!.add(refetch)
      seedFromCache(newId)
    }
    void fetchUserData()
  }, { immediate: true })

  if (getCurrentInstance()) {
    onUnmounted(() => {
      const id = unref(userId)
      if (id != null && id !== '') {
        const set = _activeInstances.get(id)
        if (set) {
          set.delete(refetch)
          if (set.size === 0)
            _activeInstances.delete(id)
        }
      }
    })
  }

  // Only force-refetch on sign-in, to bust role and avatar nulls cached before
  // auth. currentUser flickers on navigation, and refetching on that or on
  // sign-out flashes skeletons and anonymous usernames.
  let _wasAuthed = currentUser.value != null
  watch(currentUser, (newUser) => {
    const isAuthed = newUser != null
    const justSignedIn = !_wasAuthed && isAuthed
    _wasAuthed = isAuthed

    if (justSignedIn) {
      void fetchUserData(true)
    }
  })

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
    user: readonly(user),
    loading: readonly(loading),
    error: readonly(error),

    userInitials: readonly(userInitials),
    hasRole: readonly(hasRole),

    refetch,
    invalidateUser,
    invalidateAllUsers,

    cache,
  }
}

/**
 * Patches `last_seen` on a cached profile without evicting the rest, so presence
 * shows up right after a fresh fetch like the online users list.
 */
export function patchProfileLastSeen(userId: string, lastSeen: string): void {
  const cache = useCache()
  const key = getCacheKeys(userId).profile
  const existing = cache.get<ProfileCacheEntry>(key)
  if (existing) {
    cache.set(key, { ...existing, last_seen: lastSeen }, 10 * 60 * 1000)
  }
}

/**
 * Shares the global cache and inflight maps, so single useDataUser calls racing
 * a bulk load attach to the same promises.
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

      // Don't fetch avatars unauthenticated. RLS blocks the storage list call
      // and the cached nulls would keep them from loading after sign-in.
      const avatarIdsToFetch = includeAvatar && currentUser.value ? ids.filter(id => !cache.has(`user:avatar:${id}`)) : []

      // Pre-populate from cache synchronously before any async work so the
      // component can render immediately on warm hits without a loading flash.
      const warmMap = new Map<string, UserDisplayData>()
      for (const id of ids) {
        const profile = cache.get<ProfileCacheEntry>(`user:profile:${id}`)
        const role = includeRole ? cache.get<string | null>(`user:role:${id}`) : null
        const avatarUrl = includeAvatar ? cache.get<string | null>(`user:avatar:${id}`) : null
        if (profile) {
          warmMap.set(id, {
            id: profile.id,
            username: profile.username,
            username_set: profile.username_set ?? false,
            role: role ?? null,
            avatarUrl: avatarUrl ?? null,
            supporter_lifetime: profile.supporter_lifetime ?? false,
            supporter_patreon: profile.supporter_patreon ?? false,
            introduction: profile.introduction ?? null,
            country: profile.country ?? null,
            created_at: profile.created_at ?? null,
            isPublic: profile.isPublic ?? false,
            has_banner: profile.has_banner ?? false,
            banner_extension: profile.banner_extension ?? null,
            last_seen: profile.last_seen ?? null,
          })
        }
      }
      if (warmMap.size > 0)
        users.value = warmMap

      const needsNetwork = profileIdsToFetch.length > 0 || roleIdsToFetch.length > 0 || avatarIdsToFetch.length > 0
      if (!needsNetwork)
        return

      loading.value = true

      const [profileResults, roleResults] = await Promise.all([
        profileIdsToFetch.length > 0
          ? supabase
              .from('profiles')
              .select('id, username, username_set, supporter_lifetime, supporter_patreon, introduction, country, created_at, public, has_banner, avatar_extension, banner_extension, last_seen')
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
          introduction: profile.introduction ?? null,
          country: profile.country ?? null,
          created_at: profile.created_at ?? null,
          isPublic: profile.public ?? false,
          has_banner: profile.has_banner ?? false,
          avatar_extension: profile.avatar_extension ?? null,
          banner_extension: profile.banner_extension ?? null,
          last_seen: profile.last_seen ?? null,
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
          const cacheKey = `user:avatar:${id}`
          let inflight = _inflightAvatars.get(id)
          if (inflight == null) {
            inflight = (async () => {
              let avatarUrl: string | null = null
              try {
                const cachedProfile = cache.get<ProfileCacheEntry>(`user:profile:${id}`)
                avatarUrl = await getUserAvatarUrl(supabase, id, cachedProfile?.avatar_extension)
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
            introduction: profile.introduction ?? null,
            country: profile.country ?? null,
            created_at: profile.created_at ?? null,
            isPublic: profile.isPublic ?? false,
            has_banner: profile.has_banner ?? false,
            banner_extension: profile.banner_extension ?? null,
            last_seen: profile.last_seen ?? null,
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

  // Per-instance map of id -> bound refetch fn so we can delete by reference.
  const _bulkRefetchFns = new Map<string, () => Promise<void>>()

  async function refetchForId(id: string): Promise<void> {
    const keys = getCacheKeys(id)
    cache.delete(keys.profile)
    cache.delete(keys.avatar)
    await fetchUsers()
  }

  function registerIds(ids: string[]) {
    for (const id of ids) {
      if (_bulkRefetchFns.has(id))
        continue

      const fn = async () => refetchForId(id)
      _bulkRefetchFns.set(id, fn)
      if (!_activeInstances.has(id))
        _activeInstances.set(id, new Set())
      _activeInstances.get(id)!.add(fn)
    }
  }

  function deregisterIds(ids: string[]) {
    for (const id of ids) {
      const fn = _bulkRefetchFns.get(id)
      if (!fn)
        continue

      _bulkRefetchFns.delete(id)
      const set = _activeInstances.get(id)
      if (set) {
        set.delete(fn)
        if (set.size === 0)
          _activeInstances.delete(id)
      }
    }
  }

  // Compared by content, so a new array with the same IDs (e.g. a .map() in the
  // parent on every render) doesn't refetch.
  watch(
    () => unref(userIds).join(','),
    (newJoined, oldJoined) => {
      const oldIds = oldJoined != null && oldJoined !== '' ? oldJoined.split(',') : []
      const newIds = newJoined != null && newJoined !== '' ? newJoined.split(',') : []
      deregisterIds(oldIds)
      registerIds(newIds)
      void fetchUsers()
    },
    { immediate: true },
  )

  if (getCurrentInstance()) {
    onUnmounted(() => {
      deregisterIds(unref(userIds))
    })
  }

  // Only refetch on the sign-in transition, as in useDataUser.
  let _wasAuthed = currentUser.value != null
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
