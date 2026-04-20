<script setup lang='ts'>
import type { Tables } from '@/types/database.overrides'

import { Button, Flex, Input, Tab, Tabs } from '@dolanske/vui'

import ReferendumGrid from '@/components/Votes/ReferendumGrid.vue'
import ReferendumModal from '@/components/Votes/ReferendumModal.vue'

const user = useSupabaseUser()
const userId = useUserId()
const supabase = useSupabaseClient()

useHead({
  title: 'Vote',
  htmlAttrs: {
    lang: 'en',
  },
})

const tab = ref<'Active' | 'Concluded'>('Active')
const search = ref('')

const PAGE_SIZE = 12

// ─── Public referendums (paginated) ──────────────────────────────────────────

const activePublicItems = ref<Tables<'referendums'>[]>([])
const activePublicOffset = ref(0)
const activePublicExhausted = ref(false)
const activePublicLoading = ref(false)

const concludedPublicItems = ref<Tables<'referendums'>[]>([])
const concludedPublicOffset = ref(0)
const concludedPublicExhausted = ref(false)
const concludedPublicLoading = ref(false)

async function fetchActivePublicPage() {
  if (activePublicLoading.value || activePublicExhausted.value)
    return

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
    activePublicItems.value = [...activePublicItems.value, ...rows]
    activePublicOffset.value = offset + rows.length
    if (rows.length < PAGE_SIZE)
      activePublicExhausted.value = true
  }
  catch (err) {
    console.error('Error fetching active public referendums:', err)
  }
  finally {
    activePublicLoading.value = false
  }
}

async function fetchConcludedPublicPage() {
  if (concludedPublicLoading.value || concludedPublicExhausted.value)
    return

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
    concludedPublicItems.value = [...concludedPublicItems.value, ...rows]
    concludedPublicOffset.value = offset + rows.length
    if (rows.length < PAGE_SIZE)
      concludedPublicExhausted.value = true
  }
  catch (err) {
    console.error('Error fetching concluded public referendums:', err)
  }
  finally {
    concludedPublicLoading.value = false
  }
}

function resetAndLoadActivePublic() {
  activePublicItems.value = []
  activePublicOffset.value = 0
  activePublicExhausted.value = false
  void fetchActivePublicPage()
}

function resetAndLoadConcludedPublic() {
  concludedPublicItems.value = []
  concludedPublicOffset.value = 0
  concludedPublicExhausted.value = false
  void fetchConcludedPublicPage()
}

// Load first page when user is available
watch(
  user,
  (u) => {
    if (u) {
      resetAndLoadActivePublic()
    }
  },
  { immediate: true },
)

// When tab changes, load the other tab's first page if not yet started
watch(tab, (newTab) => {
  if (newTab === 'Active' && activePublicOffset.value === 0 && !activePublicLoading.value) {
    resetAndLoadActivePublic()
  }
  else if (newTab === 'Concluded' && concludedPublicOffset.value === 0 && !concludedPublicLoading.value) {
    resetAndLoadConcludedPublic()
  }
})

// ─── User's own private referendums + voted-in private referendums ────────────

const ownPrivateActive = ref<Tables<'referendums'>[]>([])
const ownPrivateConcluded = ref<Tables<'referendums'>[]>([])
const loadingOwnActive = ref(false)
const loadingOwnConcluded = ref(false)

const userVotedReferendumIds = ref<number[]>([])
const votedPrivateReferendums = ref<Tables<'referendums'>[]>([])
const loadingVoted = ref(false)

async function fetchOwnPrivate() {
  if (!userId.value)
    return

  loadingOwnActive.value = true
  loadingOwnConcluded.value = true

  try {
    const now = new Date().toISOString()

    const [activeRes, concludedRes] = await Promise.all([
      supabase
        .from('referendums')
        .select('*')
        .eq('is_public', false)
        .eq('created_by', userId.value)
        .gte('date_end', now)
        .order('created_at', { ascending: false }),
      supabase
        .from('referendums')
        .select('*')
        .eq('is_public', false)
        .eq('created_by', userId.value)
        .lt('date_end', now)
        .order('created_at', { ascending: false }),
    ])

    if (activeRes.error)
      throw activeRes.error
    if (concludedRes.error)
      throw concludedRes.error

    ownPrivateActive.value = activeRes.data ?? []
    ownPrivateConcluded.value = concludedRes.data ?? []
  }
  catch (err) {
    console.error('Error fetching own private referendums:', err)
  }
  finally {
    loadingOwnActive.value = false
    loadingOwnConcluded.value = false
  }
}

async function fetchVotedPrivate() {
  if (!userId.value)
    return

  loadingVoted.value = true

  try {
    // Step 1 - all referendum IDs this user has voted on
    const { data: votes, error: votesError } = await supabase
      .from('referendum_votes')
      .select('referendum_id')
      .eq('user_id', userId.value)

    if (votesError)
      throw votesError

    const ids = (votes ?? [])
      .map(v => v.referendum_id)
      .filter((id): id is number => id != null)

    userVotedReferendumIds.value = ids

    if (ids.length === 0) {
      votedPrivateReferendums.value = []
      return
    }

    // Step 2 - fetch those referendums that are private and not created by us
    const { data: referendums, error: refError } = await supabase
      .from('referendums')
      .select('*')
      .in('id', ids)
      .eq('is_public', false)
      .neq('created_by', userId.value)

    if (refError)
      throw refError

    votedPrivateReferendums.value = referendums ?? []
  }
  catch (err) {
    console.error('Error fetching voted private referendums:', err)
  }
  finally {
    loadingVoted.value = false
  }
}

watch(userId, (id) => {
  if (id != null) {
    void fetchOwnPrivate()
    void fetchVotedPrivate()
  }
}, { immediate: true })

// ─── Merged lists ─────────────────────────────────────────────────────────────

function mergeReferendums(
  publicList: readonly Tables<'referendums'>[],
  ownList: readonly Tables<'referendums'>[],
  votedList: readonly Tables<'referendums'>[],
  afterDate: boolean,
): Tables<'referendums'>[] {
  const seen = new Set<number>()
  const result: Tables<'referendums'>[] = []

  for (const r of publicList) {
    if (!seen.has(r.id)) {
      seen.add(r.id)
      result.push(r)
    }
  }

  for (const r of ownList) {
    if (!seen.has(r.id)) {
      seen.add(r.id)
      result.push(r)
    }
  }

  const now = new Date().toISOString()
  for (const r of votedList) {
    const isAfter = r.date_end >= now
    if (isAfter !== afterDate)
      continue
    if (!seen.has(r.id)) {
      seen.add(r.id)
      result.push(r)
    }
  }

  return result
}

const mergedActive = computed(() =>
  mergeReferendums(
    activePublicItems.value,
    ownPrivateActive.value,
    votedPrivateReferendums.value,
    true,
  ),
)

const mergedConcluded = computed(() =>
  mergeReferendums(
    concludedPublicItems.value,
    ownPrivateConcluded.value,
    votedPrivateReferendums.value,
    false,
  ),
)

// ─── Vote counts ──────────────────────────────────────────────────────────────

const allVisibleIds = computed(() => {
  const ids = new Set<number>()
  mergedActive.value.forEach(r => ids.add(r.id))
  mergedConcluded.value.forEach(r => ids.add(r.id))
  return [...ids]
})

const referendumVoteCounts = ref(new Map<number, number>())
const referendumVoterIds = ref(new Map<number, string[]>())
let voteCountFetchController: AbortController | null = null

async function fetchVoteCounts(ids: number[]) {
  if (ids.length === 0) {
    referendumVoteCounts.value = new Map()
    referendumVoterIds.value = new Map()
    return
  }

  // Cancel any in-flight fetch
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
  }
  catch (err) {
    console.error('Error fetching vote counts:', err)
  }
}

// Debounce vote count fetches so rapid list changes don't fire many requests
let voteCountDebounceTimer: ReturnType<typeof setTimeout> | null = null

watch(
  allVisibleIds,
  (ids) => {
    if (voteCountDebounceTimer !== null)
      clearTimeout(voteCountDebounceTimer)
    voteCountDebounceTimer = setTimeout(() => {
      void fetchVoteCounts(ids)
    }, 150)
  },
  { immediate: true },
)

function getVoteCount(referendumId: number): number {
  return referendumVoteCounts.value.get(referendumId) ?? 0
}

function getVoterIds(referendumId: number): string[] {
  return referendumVoterIds.value.get(referendumId) ?? []
}

function hasVoted(referendumId: number): boolean {
  return userVotedReferendumIds.value.includes(referendumId)
}

// ─── Modal state ──────────────────────────────────────────────────────────────

const modalOpen = ref(false)
const editingReferendum = ref<Tables<'referendums'> | null>(null)

function openCreate() {
  editingReferendum.value = null
  modalOpen.value = true
}

function handleModalClose() {
  modalOpen.value = false
  editingReferendum.value = null
}

function handleCreated(referendum: Tables<'referendums'>) {
  if (referendum.date_end >= new Date().toISOString()) {
    ownPrivateActive.value = [referendum, ...ownPrivateActive.value]
  }
  else {
    ownPrivateConcluded.value = [referendum, ...ownPrivateConcluded.value]
  }
  modalOpen.value = false
}

function handleUpdated(referendum: Tables<'referendums'>) {
  const patch = (list: Tables<'referendums'>[]) =>
    list.map(r => r.id === referendum.id ? referendum : r)

  ownPrivateActive.value = patch(ownPrivateActive.value)
  ownPrivateConcluded.value = patch(ownPrivateConcluded.value)
  votedPrivateReferendums.value = patch(votedPrivateReferendums.value)
  modalOpen.value = false
  editingReferendum.value = null
}

function handleDeleted(referendumId: number) {
  const remove = (list: Tables<'referendums'>[]) =>
    list.filter(r => r.id !== referendumId)

  ownPrivateActive.value = remove(ownPrivateActive.value)
  ownPrivateConcluded.value = remove(ownPrivateConcluded.value)
  votedPrivateReferendums.value = remove(votedPrivateReferendums.value)
  modalOpen.value = false
  editingReferendum.value = null
}

// ─── Search / display ─────────────────────────────────────────────────────────

const isLoading = computed(() => {
  if (tab.value === 'Active')
    return activePublicLoading.value || loadingOwnActive.value || loadingVoted.value
  return concludedPublicLoading.value || loadingOwnConcluded.value || loadingVoted.value
})

const showLoadMoreActive = computed(
  () => !activePublicExhausted.value && !activePublicLoading.value && !search.value.trim(),
)

const showLoadMoreConcluded = computed(
  () => !concludedPublicExhausted.value && !concludedPublicLoading.value && !search.value.trim(),
)

const currentReferendums = computed(() => {
  const list = tab.value === 'Active' ? mergedActive.value : mergedConcluded.value

  if (!search.value.trim())
    return list

  const searchLower = search.value.toLowerCase()
  return list.filter(r =>
    r.title.toLowerCase().includes(searchLower)
    || r.description?.toLowerCase().includes(searchLower),
  )
})
</script>

<template>
  <div class="page container-l">
    <section class="page-title">
      <h1>
        Votes
      </h1>
      <p>
        Planning a movie night? Need to decide dates for an event? Let others cast their vote and figure it out!
      </p>
    </section>

    <Flex x-between y-center class="my-m">
      <Tabs v-model="tab">
        <Tab value="Active" />
        <Tab value="Concluded" />
        <template #end>
          <Button v-if="user" variant="accent" size="s" @click="openCreate">
            <template #start>
              <Icon name="ph:plus" />
            </template>
            New vote
          </Button>
        </template>
      </Tabs>
    </Flex>

    <Flex x-between y-center class="mb-l">
      <Input v-model="search" placeholder="Search items..." type="search">
        <template #start>
          <Icon name="ph:magnifying-glass" />
        </template>
      </Input>
      <span v-if="isLoading" class="text-s text-color-lighter">Loading...</span>
      <span v-else class="text-s text-color-lighter">
        {{ currentReferendums.length }} result{{ currentReferendums.length !== 1 ? 's' : '' }}
      </span>
    </Flex>

    <!-- Active tab -->
    <template v-if="tab === 'Active'">
      <ReferendumGrid
        :referendums="currentReferendums"
        :is-loading="isLoading"
        empty-title="No active votes"
        empty-message="Stay on the lookout for new votes!"
        :get-vote-count="getVoteCount"
        :get-voter-ids="getVoterIds"
        :has-voted="hasVoted"
      />
      <Flex v-if="showLoadMoreActive" x-center class="mt-l">
        <Button variant="gray" :loading="activePublicLoading" @click="fetchActivePublicPage">
          Load more
        </Button>
      </Flex>
    </template>

    <!-- Concluded tab -->
    <template v-else>
      <ReferendumGrid
        :referendums="currentReferendums"
        :is-loading="isLoading"
        empty-title="No concluded votes"
        empty-message="Previous votes will appear here once they conclude."
        :get-vote-count="getVoteCount"
        :get-voter-ids="getVoterIds"
        :has-voted="hasVoted"
      />
      <Flex v-if="showLoadMoreConcluded" x-center class="mt-l">
        <Button variant="gray" :loading="concludedPublicLoading" @click="fetchConcludedPublicPage">
          Load more
        </Button>
      </Flex>
    </template>

    <ReferendumModal
      :open="modalOpen"
      :edited-item="editingReferendum"
      @close="handleModalClose"
      @created="handleCreated"
      @updated="handleUpdated"
      @deleted="handleDeleted"
    />
  </div>
</template>
