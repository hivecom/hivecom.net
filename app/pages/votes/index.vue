<script setup lang='ts'>
import type { Tables } from '@/types/database.types'

import { Flex, Grid, Input, Skeleton, Tab, Tabs } from '@dolanske/vui'

import ReferendumCard from '@/components/Shared/ReferendumCard.vue'
import { useCacheQuery } from '@/composables/useCache'

// Redirect to login if user is not authenticated
const user = useSupabaseUser()
watch(user, (newUser) => {
  if (newUser === null) {
    navigateTo('/auth/sign-in')
  }
}, { immediate: true })

useHead({
  title: 'Vote',
  htmlAttrs: {
    lang: 'en',
  },
})

const tab = ref<'Active' | 'Concluded'>('Active')
const search = ref('')

type ReferendumStatus = 'active' | 'upcoming' | 'concluded'

// Get current date for filtering
const currentDate = new Date().toISOString()

// Fetch active referendums
const { data: activeReferendums, loading: loadingActive, refetch: _refetchActive } = useCacheQuery<Tables<'referendums'>[]>(
  {
    table: 'referendums',
    select: '*',
    filters: {
      date_end: currentDate,
    },
    filterOperators: {
      date_end: 'gte',
    },
    orderBy: { created_at: false },
  },
  {
    enabled: computed(() => tab.value === 'Active' && !!user.value),
    ttl: 60000, // 1 minute cache
  },
)

// Fetch concluded referendums
const { data: concludedReferendums, loading: loadingConcluded, refetch: _refetchConcluded } = useCacheQuery<Tables<'referendums'>[]>(
  {
    table: 'referendums',
    select: '*',
    filters: {
      date_end: currentDate,
    },
    filterOperators: {
      date_end: 'lt',
    },
    orderBy: { created_at: false },
  },
  {
    enabled: computed(() => tab.value === 'Concluded' && !!user.value),
    ttl: 300000, // 5 minute cache for concluded
  },
)

// Simple vote count fetching - get all votes and count per referendum
const { data: allVotesForCounting } = useCacheQuery<Tables<'referendum_votes'>[]>(
  {
    table: 'referendum_votes',
    select: 'referendum_id, user_id',
  },
  {
    enabled: computed(() => !!user.value && ((activeReferendums.value?.length || 0) > 0 || (concludedReferendums.value?.length || 0) > 0)),
    ttl: 60000, // 1 minute cache
  },
)

// Compute vote counts and voter IDs per referendum
const referendumVoteCounts = computed(() => {
  if (!allVotesForCounting.value)
    return new Map()

  const counts = new Map<number, number>()
  allVotesForCounting.value.forEach((vote) => {
    if (vote.referendum_id) {
      counts.set(vote.referendum_id, (counts.get(vote.referendum_id) || 0) + 1)
    }
  })
  return counts
})

const referendumVoterIds = computed(() => {
  if (!allVotesForCounting.value)
    return new Map()

  const voterIds = new Map<number, string[]>()
  allVotesForCounting.value.forEach((vote) => {
    if (vote.referendum_id && vote.user_id) {
      const currentVoters = voterIds.get(vote.referendum_id) || []
      if (!currentVoters.includes(vote.user_id)) {
        currentVoters.push(vote.user_id)
        voterIds.set(vote.referendum_id, currentVoters)
      }
    }
  })
  return voterIds
})

// Helper functions
function getVoteCount(referendumId: number): number {
  return referendumVoteCounts.value.get(referendumId) || 0
}

function getVoterIds(referendumId: number): string[] {
  return referendumVoterIds.value.get(referendumId) || []
}

// Loading state for current tab
const isLoading = computed(() => {
  return tab.value === 'Active' ? loadingActive.value : loadingConcluded.value
})

// Computed for current referendums based on tab
const currentReferendums = computed(() => {
  const referendums = tab.value === 'Active' ? activeReferendums.value : concludedReferendums.value
  if (!referendums)
    return []

  if (!search.value.trim())
    return referendums

  const searchLower = search.value.toLowerCase()
  return referendums.filter(referendum =>
    referendum.title.toLowerCase().includes(searchLower)
    || referendum.description?.toLowerCase().includes(searchLower),
  )
})

function getReferendumStatus(referendum: { date_start: string, date_end: string }): ReferendumStatus {
  const now = new Date()
  const start = new Date(referendum.date_start)
  const end = new Date(referendum.date_end)

  if (now < start)
    return 'upcoming'
  if (now > end)
    return 'concluded'
  return 'active'
}
</script>

<template>
  <div class="page">
    <!-- Hero section -->
    <section>
      <Flex :gap="0" expand column>
        <Flex y-center x-between expand>
          <h1>
            Votes
          </h1>
        </Flex>
        <p>
          Planning a movie night? Need to decide dates for an event? Let others cast their vote and figure it out!
        </p>
      </Flex>
    </section>

    <Tabs v-model="tab" class="my-m">
      <Tab value="Active" />
      <Tab value="Concluded" />
    </Tabs>

    <Flex x-between y-center class="mb-l">
      <Input v-model="search" placeholder="Search items..." type="search">
        <template #start>
          <Icon name="ph:magnifying-glass" />
        </template>
      </Input>
      <span v-if="isLoading" class="text-s text-color-lighter">Loading...</span>
      <span v-else class="text-s text-color-lighter">{{ currentReferendums.length }} result{{ currentReferendums.length !== 1 ? 's' : '' }}</span>
    </Flex>

    <template v-if="tab === 'Active'">
      <!-- Loading state -->
      <Grid v-if="loadingActive" gap="m" :columns="2" class="referendum-cards-grid">
        <div v-for="n in 4" :key="`skeleton-${n}`" class="skeleton-card">
          <Skeleton :height="200" :radius="12" />
        </div>
      </Grid>

      <!-- Empty state -->
      <div v-else-if="currentReferendums.length === 0" class="text-center p-xl">
        <Icon name="ph:user-sound" size="3rem" class="text-color-light mb-m" />
        <h3>No active referendums</h3>
        <p class="text-color-light">
          Stay on the lookout for new referendums!
        </p>
      </div>

      <!-- Actual content -->
      <Grid v-else gap="m" :columns="2" class="referendum-cards-grid">
        <ReferendumCard
          v-for="referendum in currentReferendums"
          :key="referendum.id"
          :referendum="referendum"
          :vote-count="getVoteCount(referendum.id)"
          :voter-ids="getVoterIds(referendum.id)"
          :status="getReferendumStatus(referendum)"
        />
      </Grid>
    </template>

    <template v-else>
      <!-- Loading state -->
      <Grid v-if="loadingConcluded" gap="m" :columns="2" class="referendum-cards-grid">
        <div v-for="n in 4" :key="`skeleton-${n}`" class="skeleton-card">
          <Skeleton :height="200" :radius="12" />
        </div>
      </Grid>

      <!-- Empty state -->
      <div v-else-if="currentReferendums.length === 0" class="text-center p-xl">
        <Icon name="ph:user-sound" size="3rem" class="text-color-light mb-m" />
        <h3>No concluded referendums</h3>
        <p class="text-color-light">
          Previous referendums will appear here once they conclude.
        </p>
      </div>

      <!-- Actual content -->
      <Grid v-else gap="m" :columns="2" class="referendum-cards-grid">
        <ReferendumCard
          v-for="referendum in currentReferendums"
          :key="referendum.id"
          :referendum="referendum"
          :vote-count="getVoteCount(referendum.id)"
          :voter-ids="getVoterIds(referendum.id)"
          :status="getReferendumStatus(referendum)"
        />
      </Grid>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.referendum-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--space-m);
  align-items: stretch; /* Ensures all cards stretch to the same height */

  :deep(.referendum-card) {
    height: 100%; /* Make cards fill their grid cell */
    display: flex;
    flex-direction: column;
  }

  .skeleton-card {
    min-height: 200px; /* Ensure skeleton cards match the expected card height */
  }
}

@media (max-width: 768px) {
  .referendum-cards-grid {
    grid-template-columns: 1fr; /* Single column on mobile */
  }
}
</style>
