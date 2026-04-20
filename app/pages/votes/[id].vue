<script setup lang='ts'>
import type { Tables } from '@/types/database.overrides'
import { Button, Flex, Tooltip } from '@dolanske/vui'
import dayjs from 'dayjs'

import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import ReferendumModal from '@/components/Votes/ReferendumModal.vue'
import VoteChoices from '@/components/Votes/VoteChoices.vue'
import VoteHeader from '@/components/Votes/VoteHeader.vue'
import VoteLoadingSkeleton from '@/components/Votes/VoteLoadingSkeleton.vue'
import VoteResults from '@/components/Votes/VoteResults.vue'
import { useCachedFetch } from '@/composables/useCache'
import { useRealtimeReferendumVotes } from '@/composables/useRealtimeReferendumVotes'

import { useBreakpoint } from '@/lib/mediaQuery'
import { formatDuration } from '@/lib/utils/duration'

const isMobile = useBreakpoint('<s')

const route = useRoute()

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const userId = useUserId()

const referendumId = computed(() => Number(route.params.id))

// Fetch referendum details
const { data: referendum, loading: loadingReferendum, refetch: _refetchReferendum } = useCachedFetch<Tables<'referendums'>>(
  () => !Number.isNaN(referendumId.value) && !!user.value
    ? {
        table: 'referendums',
        select: '*',
        filters: { id: referendumId.value },
        single: true,
      }
    : null,
  {
    ttl: 60000, // 1 minute cache
  },
)

// ─── Edit modal ───────────────────────────────────────────────────────────────

const editModalOpen = ref(false)

const isOwnReferendum = computed(() =>
  !!userId.value && referendum.value?.created_by === userId.value,
)

function handleUpdated(updated: Tables<'referendums'>) {
  // Patch the local referendum ref so the page reflects changes immediately
  // without a full refetch. useCachedFetch will re-sync on next load.
  if (referendum.value != null) {
    // @ts-expect-error - referendum from useCachedFetch is readonly
    referendum.value = updated
  }
  editModalOpen.value = false
}

function handleDeleted() {
  navigateTo('/votes')
}

// Fetch user's existing vote
const { data: userVote, loading: _loadingVote, refetch: refetchVote } = useCachedFetch<Tables<'referendum_votes'>>(
  () => !Number.isNaN(referendumId.value) && !!user.value?.id
    ? {
        table: 'referendum_votes',
        select: '*',
        filters: {
          referendum_id: referendumId.value,
          user_id: user.value!.id,
        },
        single: true,
      }
    : null,
  {
    ttl: 30000, // 30 second cache for votes
  },
)

// Fetch all votes for this referendum (for displaying results)
const { data: fetchedVotes, loading: loadingAllVotes, refetch: refetchAllVotes } = useCachedFetch<Tables<'referendum_votes'>[]>(
  () => !Number.isNaN(referendumId.value) && !!user.value
    ? {
        table: 'referendum_votes',
        select: '*',
        filters: { referendum_id: referendumId.value },
      }
    : null,
  {
    ttl: 30000, // 30 second cache
  },
)

// Keep allVotes live via realtime subscription - starts from the cache query
// result and patches in INSERT/UPDATE/DELETE events from other tabs/users.
const { votes: allVotes } = useRealtimeReferendumVotes(
  computed(() => referendumId.value),
  computed(() => fetchedVotes.value as Tables<'referendum_votes'>[] | null | undefined),
)

// Voting state
const selectedChoices = ref<number[]>([])
const isSubmitting = ref(false)

// Results visibility state
const showResults = ref(false)
const showConfirmModal = ref(false)

// Remove vote state
const showRemoveVoteModal = ref(false)
const isRemovingVote = ref(false)

// Initialize voting state when user vote loads
watch([userVote], ([vote]) => {
  if (vote) {
    selectedChoices.value = [...vote.choices]
  }
}, { immediate: true })

// Computed properties
const isActive = computed(() => {
  if (!referendum.value)
    return false
  const now = dayjs()
  const start = dayjs(referendum.value.date_start)
  const end = dayjs(referendum.value.date_end)
  return now.isAfter(start) && now.isBefore(end)
})

const isUpcoming = computed(() => {
  if (!referendum.value)
    return false
  const now = dayjs()
  const start = dayjs(referendum.value.date_start)
  return now.isBefore(start)
})

const statusVariant = computed(() => {
  if (isUpcoming.value)
    return 'warning'
  return isActive.value ? 'success' : 'neutral'
})

const statusLabel = computed(() => {
  if (isUpcoming.value)
    return 'Upcoming'
  return isActive.value ? 'Active' : 'Concluded'
})

const hasVoted = computed(() => !!userVote.value)

const timeRemaining = computed(() => {
  if (!referendum.value)
    return ''

  const diff = dayjs(referendum.value.date_end).diff(dayjs())

  if (diff <= 0)
    return ''

  const formatted = formatDuration(diff)
  return formatted ? `${formatted} remaining` : 'Less than 1 minute remaining'
})

const timeUntilStart = computed(() => {
  if (!referendum.value)
    return ''

  const diff = dayjs(referendum.value.date_start).diff(dayjs())

  if (diff <= 0)
    return ''

  const formatted = formatDuration(diff)
  return formatted ? `${formatted} until voting opens` : 'Less than 1 minute until voting opens'
})

const timeAgo = computed(() => {
  if (!referendum.value)
    return ''

  const diff = dayjs(dayjs()).diff(dayjs(referendum.value.date_end))
  return `${formatDuration(diff)} ago`
})

const totalVoters = computed(() => allVotes.value.length)

const shouldShowResults = computed(() => {
  // Always show results if user has voted or if the referendum has concluded
  return hasVoted.value || (!isActive.value && !isUpcoming.value) || showResults.value
})

const isLoadingResults = computed(() => {
  return shouldShowResults.value && (loadingAllVotes.value || (shouldShowResults.value && !allVotes.value))
})

// Handle choice selection for multiple choice
function updateMultipleChoice(choiceIndex: number, isSelected: boolean) {
  if (isSelected) {
    if (!selectedChoices.value.includes(choiceIndex)) {
      selectedChoices.value.push(choiceIndex)
    }
  }
  else {
    const index = selectedChoices.value.indexOf(choiceIndex)
    if (index > -1) {
      selectedChoices.value.splice(index, 1)
    }
  }
}

// Handle choice selection for single choice
function updateSingleChoice(choiceIndex: number) {
  selectedChoices.value = [choiceIndex]
}

// Submit vote
async function submitVote() {
  if (!user.value || !referendum.value || selectedChoices.value.length === 0)
    return

  isSubmitting.value = true

  try {
    const voteData = {
      referendum_id: referendum.value.id,
      user_id: userId.value,
      choices: selectedChoices.value,
    }

    if (userVote.value) {
      // Update existing vote
      const { error } = await supabase
        .from('referendum_votes')
        .update(voteData)
        .eq('id', userVote.value.id)

      if (error)
        throw error
    }
    else {
      // Create new vote
      const { error } = await supabase
        .from('referendum_votes')
        .insert(voteData)

      if (error)
        throw error
    }

    // Refetch data - realtime will also patch allVotes, but an explicit
    // refetch ensures the user's own vote is reflected immediately.
    await Promise.all([
      refetchVote(),
      refetchAllVotes(),
    ])
  }
  catch (error) {
    console.error('Error submitting vote:', error)
    // TODO: Show error message to user
  }
  finally {
    isSubmitting.value = false
  }
}

// Handle revealing results
function requestRevealResults() {
  showConfirmModal.value = true
}

function confirmRevealResults() {
  showResults.value = true
}

// Handle removing vote
function requestRemoveVote() {
  showRemoveVoteModal.value = true
}

async function confirmRemoveVote() {
  if (!userVote.value)
    return

  isRemovingVote.value = true

  try {
    const { error } = await supabase
      .from('referendum_votes')
      .delete()
      .eq('id', userVote.value.id)

    if (error)
      throw error

    // Reset voting state
    selectedChoices.value = []

    // Refetch data
    await Promise.all([
      refetchVote(),
      refetchAllVotes(),
    ])
  }
  catch (error) {
    console.error('Error removing vote:', error)
    // TODO: Show error message to user
  }
  finally {
    isRemovingVote.value = false
  }
}

// Page metadata
useHead({
  title: computed(() => referendum.value ? `${referendum.value.title} - Vote` : 'Vote'),
})

function handleChoiceClick(index: number) {
  if (!referendum.value)
    return

  if (referendum.value.multiple_choice) {
    const currentValue = selectedChoices.value.includes(index)
    updateMultipleChoice(index, !currentValue)
  }
  else {
    updateSingleChoice(index)
  }
}
</script>

<template>
  <div class="page">
    <div :class="!isMobile && 'container-m'">
      <!-- Loading state: show skeleton while auth is unresolved OR data is loading -->
      <VoteLoadingSkeleton v-if="loadingReferendum || !user" />

      <!-- Referendum not found -->
      <Flex v-else-if="!referendum" column class="text-center p-xl" x-center y-center>
        <Icon name="ph:question" size="3rem" class="text-color-light mb-m" />
        <h2>Vote not found</h2>
        <p class="text-color-light mb-l">
          The vote you're looking for doesn't exist or has been removed.
        </p>
        <Button @click="navigateTo('/votes')">
          <template #start>
            <Icon name="ph:arrow-left" />
          </template>
          Back to Votes
        </Button>
      </Flex>

      <!-- Referendum content -->
      <template v-else>
        <!-- Back Button -->
        <Flex class="mb-m" x-between wrap y-center>
          <Button
            variant="gray"
            size="s"
            plain
            aria-label="Go back to Votes page"
            @click="navigateTo('/votes')"
          >
            <template #start>
              <Icon name="ph:arrow-left" />
            </template>
            Back to Votes
          </Button>
          <Flex gap="s" y-center>
            <UserDisplay :user-id="referendum.created_by" />

            <Tooltip>
              <Button
                v-if="isOwnReferendum"
                variant="gray"
                size="s"
                square
                @click="editModalOpen = true"
              >
                <Icon name="ph:pencil-simple" />
              </Button>
              <template #tooltip>
                <p>Edit vote details</p>
              </template>
            </Tooltip>
          </Flex>
        </Flex>

        <!-- Header -->
        <VoteHeader
          :referendum="referendum as Tables<'referendums'>"
          :is-active="isActive"
          :is-upcoming="isUpcoming"
          :status-variant="statusVariant"
          :status-label="statusLabel"
          :total-voters="totalVoters"
          :time-remaining="timeRemaining"
          :time-until-start="timeUntilStart"
          :time-ago="timeAgo"
        />

        <!-- Voting / login prompt -->
        <VoteChoices
          v-if="isActive"
          :referendum="referendum as Tables<'referendums'>"
          :selected-choices="selectedChoices"
          :has-voted="hasVoted"
          :is-submitting="isSubmitting"
          :is-removing-vote="isRemovingVote"
          @choice-click="handleChoiceClick"
          @submit="submitVote"
          @request-remove-vote="requestRemoveVote"
        />

        <!-- Results Section -->
        <VoteResults
          :referendum="referendum as Tables<'referendums'>"
          :votes="allVotes"
          :should-show-results="shouldShowResults"
          :is-loading-results="isLoadingResults"
          :is-active="isActive"
          @request-reveal-results="requestRevealResults"
        />

        <!-- Edit Modal -->
        <ReferendumModal
          v-if="isOwnReferendum && referendum"
          :open="editModalOpen"
          :edited-item="referendum as Tables<'referendums'>"
          @close="editModalOpen = false"
          @updated="handleUpdated"
          @deleted="handleDeleted"
        />

        <!-- Reveal Results Confirmation Modal -->
        <ConfirmModal
          v-model:open="showConfirmModal"
          :confirm="confirmRevealResults"
          title="Reveal Results Early?"
          description="You haven't voted yet. Are you sure you want to see the current results? This action cannot be undone."
          confirm-text="Yes, Reveal Results"
          cancel-text="Cancel"
          :destructive="false"
        />

        <!-- Remove Vote Confirmation Modal -->
        <ConfirmModal
          v-model:open="showRemoveVoteModal"
          :confirm="confirmRemoveVote"
          title="Remove Your Vote?"
          description="Are you sure you want to remove your vote? You can always vote again later while the referendum is active."
          confirm-text="Yes, Remove Vote"
          cancel-text="Cancel"
          :destructive="true"
        />
      </template>
    </div>
  </div>
</template>
