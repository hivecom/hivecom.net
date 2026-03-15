<script setup lang='ts'>
import type { Tables } from '@/types/database.overrides'

import { Button, Flex, Input, Tab, Tabs } from '@dolanske/vui'

import ReferendumGrid from '@/components/Votes/ReferendumGrid.vue'
import ReferendumModal from '@/components/Votes/ReferendumModal.vue'
import { useCacheQuery } from '@/composables/useCache'

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

const currentDate = new Date().toISOString()

// ─── Public referendums ───────────────────────────────────────────────────────

const { data: activePublic, loading: loadingActivePublic } = useCacheQuery<Tables<'referendums'>[]>(
  {
    table: 'referendums',
    select: '*',
    filters: {
      date_end: currentDate,
      is_public: true,
    },
    filterOperators: {
      date_end: 'gte',
    },
    orderBy: { created_at: false },
  },
  {
    enabled: computed(() => tab.value === 'Active' && !!user.value),
    ttl: 60000,
  },
)

const { data: concludedPublic, loading: loadingConcludedPublic } = useCacheQuery<Tables<'referendums'>[]>(
  {
    table: 'referendums',
    select: '*',
    filters: {
      date_end: currentDate,
      is_public: true,
    },
    filterOperators: {
      date_end: 'lt',
    },
    orderBy: { created_at: false },
  },
  {
    enabled: computed(() => tab.value === 'Concluded' && !!user.value),
    ttl: 300000,
  },
)

// ─── User's own private referendums + voted-in private referendums ────────────
// These can't use useCacheQuery because the userId filter needs to be reactive
// at fetch time, not at composable setup time.

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
    // (own private ones are already in ownPrivateActive/ownPrivateConcluded)
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
// Deduplication by id - public list takes precedence (it has the canonical row),
// then own private, then voted-in private.

function mergeReferendums(
  publicList: readonly Tables<'referendums'>[] | null,
  ownList: readonly Tables<'referendums'>[] | null,
  votedList: readonly Tables<'referendums'>[],
  afterDate: boolean, // true = active (date_end >= now), false = concluded (date_end < now)
): Tables<'referendums'>[] {
  const seen = new Set<number>()
  const result: Tables<'referendums'>[] = []

  for (const r of (publicList ?? [])) {
    if (!seen.has(r.id)) {
      seen.add(r.id)
      result.push(r)
    }
  }

  for (const r of (ownList ?? [])) {
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
    activePublic.value as Tables<'referendums'>[] | null,
    ownPrivateActive.value,
    votedPrivateReferendums.value,
    true,
  ),
)

const mergedConcluded = computed(() =>
  mergeReferendums(
    concludedPublic.value as Tables<'referendums'>[] | null,
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

const { data: allVotesForCounting } = useCacheQuery<Tables<'referendum_votes'>[]>(
  {
    table: 'referendum_votes',
    select: 'referendum_id, user_id',
  },
  {
    enabled: computed(() => !!user.value && allVisibleIds.value.length > 0),
    ttl: 60000,
  },
)

const referendumVoteCounts = computed(() => {
  const counts = new Map<number, number>()
  allVotesForCounting.value?.forEach((vote) => {
    if (vote.referendum_id != null) {
      counts.set(vote.referendum_id, (counts.get(vote.referendum_id) ?? 0) + 1)
    }
  })
  return counts
})

const referendumVoterIds = computed(() => {
  const voterIds = new Map<number, string[]>()
  allVotesForCounting.value?.forEach((vote) => {
    if (vote.referendum_id != null && vote.user_id != null) {
      const current = voterIds.get(vote.referendum_id) ?? []
      if (!current.includes(vote.user_id)) {
        voterIds.set(vote.referendum_id, [...current, vote.user_id])
      }
    }
  })
  return voterIds
})

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
  // Prepend into the appropriate private list so it shows immediately
  if (referendum.date_end >= new Date().toISOString()) {
    ownPrivateActive.value = [referendum, ...ownPrivateActive.value]
  }
  else {
    ownPrivateConcluded.value = [referendum, ...ownPrivateConcluded.value]
  }
  modalOpen.value = false
}

function handleUpdated(referendum: Tables<'referendums'>) {
  // Patch in place across all lists
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
    return loadingActivePublic.value || loadingOwnActive.value || loadingVoted.value
  return loadingConcludedPublic.value || loadingOwnConcluded.value || loadingVoted.value
})

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
  <div class="page">
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
    <ReferendumGrid
      v-if="tab === 'Active'"
      :referendums="currentReferendums"
      :is-loading="isLoading"
      empty-title="No active votes"
      empty-message="Stay on the lookout for new votes!"
      :get-vote-count="getVoteCount"
      :get-voter-ids="getVoterIds"
      :has-voted="hasVoted"
    />

    <!-- Concluded tab -->
    <ReferendumGrid
      v-else
      :referendums="currentReferendums"
      :is-loading="isLoading"
      empty-title="No concluded votes"
      empty-message="Previous votes will appear here once they conclude."
      :get-vote-count="getVoteCount"
      :get-voter-ids="getVoterIds"
      :has-voted="hasVoted"
    />

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
