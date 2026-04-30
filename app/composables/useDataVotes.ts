import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref, watch } from 'vue'
import { useCache } from '@/composables/useCache'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

// TTLs
const TTL_ACTIVE = 3 * 60 * 1000 // 3 min - active referendums change infrequently
const TTL_CONCLUDED = 10 * 60 * 1000 // 10 min - concluded are immutable
const TTL_PRIVATE = 3 * 60 * 1000
const TTL_VOTE_COUNTS = 2 * 60 * 1000 // 2 min - vote counts change on interaction

const PAGE_SIZE = 12

// Module-level cache so invalidation can be called from outside (e.g. after voting).
const _votesCache = useCache(CACHE_NAMESPACES.votes)

function keyActivePublic(page: number): string {
  return `referendum:active:p${page}`
}
function keyConcludedPublic(page: number): string {
  return `referendum:concluded:p${page}`
}
function keyOwnPrivate(userId: string): string {
  return `referendum:own-private:${userId}`
}
function keyVotedPrivate(userId: string): string {
  return `referendum:voted-private:${userId}`
}
function keyVoteCounts(ids: number[]): string {
  return `referendum:vote-counts:${[...ids].sort((a, b) => a - b).join(',')}`
}

export function invalidateVotesCache(): void {
  _votesCache.clearCache()
}

interface OwnPrivateCache {
  active: Tables<'referendums'>[]
  concluded: Tables<'referendums'>[]
}

interface VoteCountsCache {
  counts: [number, number][]
  voters: [number, string[]][]
}

export function useDataVotes() {
  const supabase = useSupabaseClient<Database>()
  const cache = useCache(CACHE_NAMESPACES.votes)
  const currentUser = useSupabaseUser()
  const userId = useUserId()

  // ── Public referendums (paginated) ────────────────────────────────────────

  const activePublicItems = ref<Tables<'referendums'>[]>([])
  const activePublicOffset = ref(0)
  const activePublicExhausted = ref(false)
  const activePublicLoading = ref(false)

  const concludedPublicItems = ref<Tables<'referendums'>[]>([])
  const concludedPublicOffset = ref(0)
  const concludedPublicExhausted = ref(false)
  const concludedPublicLoading = ref(false)

  // Pre-populate first page synchronously from cache on warm nav.
  const _cachedActivePage0 = cache.get<Tables<'referendums'>[]>(keyActivePublic(0))
  if (_cachedActivePage0 !== null) {
    activePublicItems.value = _cachedActivePage0
    activePublicOffset.value = _cachedActivePage0.length
    if (_cachedActivePage0.length < PAGE_SIZE)
      activePublicExhausted.value = true
  }

  const _cachedConcludedPage0 = cache.get<Tables<'referendums'>[]>(keyConcludedPublic(0))
  if (_cachedConcludedPage0 !== null) {
    concludedPublicItems.value = _cachedConcludedPage0
    concludedPublicOffset.value = _cachedConcludedPage0.length
    if (_cachedConcludedPage0.length < PAGE_SIZE)
      concludedPublicExhausted.value = true
  }

  async function fetchActivePublicPage(force = false): Promise<void> {
    if (activePublicLoading.value || activePublicExhausted.value)
      return

    // Only skip on warm cache for the first page fetch (offset = 0).
    if (!force && activePublicOffset.value === 0) {
      const cached = cache.get<Tables<'referendums'>[]>(keyActivePublic(0))
      if (cached !== null) {
        activePublicItems.value = cached
        activePublicOffset.value = cached.length
        if (cached.length < PAGE_SIZE)
          activePublicExhausted.value = true
        return
      }
    }

    activePublicLoading.value = true
    try {
      const now = new Date().toISOString()
      const offset = activePublicOffset.value
      const { data, error } = await supabase
        .from('referendums')
        .select('*')
        .eq('is_public', true)
        .gte('date_end', now)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      if (error)
        throw error

      const rows = data ?? []
      const isFirstPage = offset === 0
      activePublicItems.value = isFirstPage ? rows : [...activePublicItems.value, ...rows]
      activePublicOffset.value = offset + rows.length
      if (rows.length < PAGE_SIZE)
        activePublicExhausted.value = true

      // Cache first page for back-nav pre-population.
      if (isFirstPage)
        cache.set(keyActivePublic(0), rows, TTL_ACTIVE)
    }
    catch (err) {
      console.error('Error fetching active public referendums:', err)
    }
    finally {
      activePublicLoading.value = false
    }
  }

  async function fetchConcludedPublicPage(force = false): Promise<void> {
    if (concludedPublicLoading.value || concludedPublicExhausted.value)
      return

    if (!force && concludedPublicOffset.value === 0) {
      const cached = cache.get<Tables<'referendums'>[]>(keyConcludedPublic(0))
      if (cached !== null) {
        concludedPublicItems.value = cached
        concludedPublicOffset.value = cached.length
        if (cached.length < PAGE_SIZE)
          concludedPublicExhausted.value = true
        return
      }
    }

    concludedPublicLoading.value = true
    try {
      const now = new Date().toISOString()
      const offset = concludedPublicOffset.value
      const { data, error } = await supabase
        .from('referendums')
        .select('*')
        .eq('is_public', true)
        .lt('date_end', now)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      if (error)
        throw error

      const rows = data ?? []
      const isFirstPage = offset === 0
      concludedPublicItems.value = isFirstPage ? rows : [...concludedPublicItems.value, ...rows]
      concludedPublicOffset.value = offset + rows.length
      if (rows.length < PAGE_SIZE)
        concludedPublicExhausted.value = true

      if (isFirstPage)
        cache.set(keyConcludedPublic(0), rows, TTL_CONCLUDED)
    }
    catch (err) {
      console.error('Error fetching concluded public referendums:', err)
    }
    finally {
      concludedPublicLoading.value = false
    }
  }

  function resetAndLoadActivePublic(): void {
    activePublicItems.value = []
    activePublicOffset.value = 0
    activePublicExhausted.value = false
    void fetchActivePublicPage(true)
  }

  function resetAndLoadConcludedPublic(): void {
    concludedPublicItems.value = []
    concludedPublicOffset.value = 0
    concludedPublicExhausted.value = false
    void fetchConcludedPublicPage(true)
  }

  // ── User's private referendums ────────────────────────────────────────────

  const ownPrivateActive = ref<Tables<'referendums'>[]>([])
  const ownPrivateConcluded = ref<Tables<'referendums'>[]>([])
  const loadingOwnActive = ref(false)
  const loadingOwnConcluded = ref(false)

  const userVotedReferendumIds = ref<number[]>([])
  const votedPrivateReferendums = ref<Tables<'referendums'>[]>([])
  const loadingVoted = ref(false)

  // Pre-populate private data from cache if user is already known.
  const _uid = userId.value
  if (_uid != null && _uid !== '') {
    const cachedOwn = cache.get<OwnPrivateCache>(keyOwnPrivate(_uid))
    if (cachedOwn !== null) {
      ownPrivateActive.value = cachedOwn.active
      ownPrivateConcluded.value = cachedOwn.concluded
    }
    const cachedVoted = cache.get<Tables<'referendums'>[]>(keyVotedPrivate(_uid))
    if (cachedVoted !== null)
      votedPrivateReferendums.value = cachedVoted
  }

  async function fetchOwnPrivate(force = false): Promise<void> {
    const id = userId.value
    if (id == null || id === '')
      return

    if (!force) {
      const cached = cache.get<OwnPrivateCache>(keyOwnPrivate(id))
      if (cached !== null) {
        ownPrivateActive.value = cached.active
        ownPrivateConcluded.value = cached.concluded
        return
      }
    }

    loadingOwnActive.value = true
    loadingOwnConcluded.value = true

    try {
      const now = new Date().toISOString()
      const [activeRes, concludedRes] = await Promise.all([
        supabase.from('referendums').select('*').eq('is_public', false).eq('created_by', id).gte('date_end', now).order('created_at', { ascending: false }),
        supabase.from('referendums').select('*').eq('is_public', false).eq('created_by', id).lt('date_end', now).order('created_at', { ascending: false }),
      ])

      if (activeRes.error)
        throw activeRes.error
      if (concludedRes.error)
        throw concludedRes.error

      ownPrivateActive.value = activeRes.data ?? []
      ownPrivateConcluded.value = concludedRes.data ?? []
      cache.set<OwnPrivateCache>(keyOwnPrivate(id), {
        active: ownPrivateActive.value,
        concluded: ownPrivateConcluded.value,
      }, TTL_PRIVATE)
    }
    catch (err) {
      console.error('Error fetching own private referendums:', err)
    }
    finally {
      loadingOwnActive.value = false
      loadingOwnConcluded.value = false
    }
  }

  async function fetchVotedPrivate(force = false): Promise<void> {
    const id = userId.value
    if (id == null || id === '')
      return

    if (!force) {
      const cached = cache.get<Tables<'referendums'>[]>(keyVotedPrivate(id))
      if (cached !== null) {
        votedPrivateReferendums.value = cached
        // Rebuild voted IDs from cached referendums.
        userVotedReferendumIds.value = cached.map(r => r.id)
        return
      }
    }

    loadingVoted.value = true
    try {
      const { data: votes, error: votesError } = await supabase
        .from('referendum_votes')
        .select('referendum_id')
        .eq('user_id', id)

      if (votesError)
        throw votesError

      const ids = (votes ?? []).map(v => v.referendum_id).filter((rid): rid is number => rid != null)
      userVotedReferendumIds.value = ids

      if (ids.length === 0) {
        votedPrivateReferendums.value = []
        cache.set(keyVotedPrivate(id), [], TTL_PRIVATE)
        return
      }

      const { data: referendums, error: refError } = await supabase
        .from('referendums')
        .select('*')
        .in('id', ids)
        .eq('is_public', false)
        .neq('created_by', id)

      if (refError)
        throw refError

      votedPrivateReferendums.value = referendums ?? []
      cache.set(keyVotedPrivate(id), votedPrivateReferendums.value, TTL_PRIVATE)
    }
    catch (err) {
      console.error('Error fetching voted private referendums:', err)
    }
    finally {
      loadingVoted.value = false
    }
  }

  // ── Vote counts ───────────────────────────────────────────────────────────

  const referendumVoteCounts = ref(new Map<number, number>())
  const referendumVoterIds = ref(new Map<number, string[]>())
  let voteCountFetchController: AbortController | null = null

  async function fetchVoteCounts(ids: number[], force = false): Promise<void> {
    if (ids.length === 0) {
      referendumVoteCounts.value = new Map()
      referendumVoterIds.value = new Map()
      return
    }

    if (!force) {
      const cached = cache.get<VoteCountsCache>(keyVoteCounts(ids))
      if (cached !== null) {
        referendumVoteCounts.value = new Map(cached.counts)
        referendumVoterIds.value = new Map(cached.voters)
        return
      }
    }

    voteCountFetchController?.abort()
    voteCountFetchController = new AbortController()

    try {
      const { data, error } = await supabase
        .from('referendum_votes')
        .select('referendum_id, user_id')
        .in('referendum_id', ids)

      if (error)
        throw error

      const counts = new Map<number, number>()
      const voters = new Map<number, string[]>()

      data?.forEach((v) => {
        if (v.referendum_id != null) {
          counts.set(v.referendum_id, (counts.get(v.referendum_id) ?? 0) + 1)
          if (v.user_id) {
            const arr = voters.get(v.referendum_id) ?? []
            if (!arr.includes(v.user_id))
              voters.set(v.referendum_id, [...arr, v.user_id])
          }
        }
      })

      referendumVoteCounts.value = counts
      referendumVoterIds.value = voters

      cache.set<VoteCountsCache>(keyVoteCounts(ids), {
        counts: [...counts.entries()],
        voters: [...voters.entries()],
      }, TTL_VOTE_COUNTS)
    }
    catch (err) {
      console.error('Error fetching vote counts:', err)
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  // Load public active on first available user (matches original behavior).
  // Initialize _wasAuthed from current state to avoid spurious force-refetch.
  let _wasAuthed = currentUser.value != null
  watch(currentUser, (u) => {
    const isAuthed = u != null
    const justSignedIn = !_wasAuthed && isAuthed
    _wasAuthed = isAuthed
    if (justSignedIn) {
      // Bust public cache on sign-in - auth may change visible referendums.
      cache.delete(keyActivePublic(0))
      cache.delete(keyConcludedPublic(0))
      resetAndLoadActivePublic()
    }
  })

  watch(userId, (id) => {
    if (id != null) {
      void fetchOwnPrivate()
      void fetchVotedPrivate()
    }
  }, { immediate: true })

  onMounted(() => {
    void fetchActivePublicPage()
  })

  // ── Helpers ───────────────────────────────────────────────────────────────

  function getVoteCount(referendumId: number): number {
    return referendumVoteCounts.value.get(referendumId) ?? 0
  }

  function getVoterIds(referendumId: number): string[] {
    return referendumVoterIds.value.get(referendumId) ?? []
  }

  function hasVoted(referendumId: number): boolean {
    return userVotedReferendumIds.value.includes(referendumId)
  }

  // Invalidate vote counts for a specific referendum (e.g. after voting).
  function invalidateVoteCountsFor(referendumId: number): void {
    // Vote count cache keys are based on the full visible ID set, so clear
    // all vote count entries - they're cheap to refetch.
    cache.invalidateByPattern('referendum:vote-counts:')
    // Optimistically mark as voted so hasVoted is consistent until next fetch.
    if (!userVotedReferendumIds.value.includes(referendumId))
      userVotedReferendumIds.value = [...userVotedReferendumIds.value, referendumId]
  }

  return {
    // Public paginated
    activePublicItems,
    activePublicLoading,
    activePublicExhausted,
    concludedPublicItems,
    concludedPublicLoading,
    concludedPublicExhausted,
    fetchActivePublicPage,
    fetchConcludedPublicPage,
    resetAndLoadActivePublic,
    resetAndLoadConcludedPublic,

    // Private
    ownPrivateActive,
    ownPrivateConcluded,
    loadingOwnActive,
    loadingOwnConcluded,
    votedPrivateReferendums,
    userVotedReferendumIds,
    loadingVoted,
    fetchOwnPrivate,
    fetchVotedPrivate,

    // Vote counts
    referendumVoteCounts,
    referendumVoterIds,
    fetchVoteCounts,
    getVoteCount,
    getVoterIds,
    hasVoted,
    invalidateVoteCountsFor,
  }
}
