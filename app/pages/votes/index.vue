<script setup lang='ts'>
import type { Tables } from '@/types/database.overrides'
import { Button, Flex, Input, Tab, Tabs } from '@dolanske/vui'
import ReferendumGrid from '@/components/Votes/ReferendumGrid.vue'
import ReferendumModal from '@/components/Votes/ReferendumModal.vue'
import { useDataVotes } from '@/composables/useDataVotes'

const user = useSupabaseUser()

useHead({
  title: 'Vote',
  htmlAttrs: {
    lang: 'en',
  },
})

const tab = ref<'Active' | 'Concluded'>('Active')
const search = ref('')

const {
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
  ownPrivateActive,
  ownPrivateConcluded,
  loadingOwnActive,
  loadingOwnConcluded,
  votedPrivateReferendums,
  loadingVoted,
  fetchVoteCounts,
  getVoteCount,
  getVoterIds,
  hasVoted,
} = useDataVotes()

// When tab changes, load the other tab's first page if not yet started
watch(tab, (newTab) => {
  if (newTab === 'Active' && activePublicItems.value.length === 0 && !activePublicLoading.value) {
    resetAndLoadActivePublic()
  }
  else if (newTab === 'Concluded' && concludedPublicItems.value.length === 0 && !concludedPublicLoading.value) {
    resetAndLoadConcludedPublic()
  }
})

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

    <ClientOnly>
      <Flex x-between y-center class="my-m">
        <Tabs v-model="tab">
          <Tab value="Active" />
          <Tab value="Concluded" />
          <template #end>
            <Button v-if="user" variant="accent" size="s" @click="openCreate">
              <template #start>
                <Icon name="ph:plus" />
              </template>
              Create
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
          <Button variant="gray" :loading="activePublicLoading" @click="fetchActivePublicPage()">
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
          <Button variant="gray" :loading="concludedPublicLoading" @click="fetchConcludedPublicPage()">
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
    </ClientOnly>
  </div>
</template>
