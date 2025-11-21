<script setup lang='ts'>
import type { Tables } from '@/types/database.types'

import { Badge, Button, Card, Checkbox, Flex, Input, Radio, Skeleton } from '@dolanske/vui'
import dayjs from 'dayjs'

import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import ReferendumResults from '@/components/Shared/ReferendumResults.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import { useCachedSupabaseQuery } from '@/composables/useSupabaseCache'
import { formatDuration } from '@/lib/utils/duration'

const route = useRoute()
const router = useRouter()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const userId = useUserId()

// Redirect to login if user is not authenticated
watch(user, (newUser) => {
  if (newUser === null) {
    navigateTo('/auth/login')
  }
}, { immediate: true })

const referendumId = computed(() => Number(route.params.id))

// Fetch referendum details
const { data: referendum, loading: loadingReferendum, refetch: _refetchReferendum } = useCachedSupabaseQuery<Tables<'referendums'>>(
  {
    table: 'referendums',
    select: '*',
    filters: {
      id: referendumId.value,
    },
    single: true,
  },
  {
    enabled: computed(() => !Number.isNaN(referendumId.value) && !!user.value),
    ttl: 60000, // 1 minute cache
  },
)

// Fetch user's existing vote
const { data: userVote, loading: _loadingVote, refetch: refetchVote } = useCachedSupabaseQuery<Tables<'referendum_votes'>>(
  {
    table: 'referendum_votes',
    select: '*',
    filters: {
      referendum_id: referendumId.value,
      user_id: user.value?.id,
    },
    single: true,
  },
  {
    enabled: computed(() => !Number.isNaN(referendumId.value) && !!user.value),
    ttl: 30000, // 30 second cache for votes
  },
)

// Fetch all votes for this referendum (for displaying results)
const { data: allVotes, loading: loadingAllVotes, refetch: refetchAllVotes } = useCachedSupabaseQuery<Tables<'referendum_votes'>[]>(
  {
    table: 'referendum_votes',
    select: '*',
    filters: {
      referendum_id: referendumId.value,
    },
  },
  {
    enabled: computed(() => !Number.isNaN(referendumId.value) && !!user.value),
    ttl: 30000, // 30 second cache
  },
)

// Voting state
const selectedChoices = ref<number[]>([])
const comment = ref('')
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
    comment.value = vote.comment || ''
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
    return 'Voting has ended'

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

const totalVoters = computed(() => allVotes.value?.length || 0)

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
      comment: comment.value.trim() || null,
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

    // Refetch data
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
    comment.value = ''

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
</script>

<template>
  <div class="page page-small">
    <!-- Loading state -->
    <div v-if="loadingReferendum" class="loading-skeleton">
      <!-- Back button skeleton -->
      <Flex class="mb-m">
        <Skeleton :width="120" :height="36" :radius="8" />
      </Flex>

      <!-- Header section skeleton -->
      <section class="mb-l">
        <Flex :gap="0" expand column>
          <Flex y-start x-between gap="xl" expand class="mb-m">
            <!-- Title skeleton -->
            <div class="flex-1">
              <Skeleton :width="400" :height="40" :radius="8" class="mb-s" />
            </div>
            <!-- User display skeleton -->
            <Flex gap="s" y-center>
              <Skeleton :width="32" :height="32" style="border-radius: 50%;" />
              <Skeleton :width="80" :height="20" :radius="4" />
            </Flex>
          </Flex>

          <!-- Description skeleton -->
          <Skeleton :width="320" :height="24" :radius="4" class="mb-m" />

          <!-- Badges skeleton -->
          <Flex gap="xs" class="mb-m">
            <Skeleton :width="60" :height="24" :radius="12" />
            <Skeleton :width="100" :height="24" :radius="12" />
            <Skeleton :width="80" :height="24" :radius="12" />
          </Flex>
        </Flex>
      </section>

      <!-- Voting section skeleton -->
      <section class="mb-xl">
        <Card class="p-l">
          <Skeleton :width="140" :height="24" :radius="4" class="mb-m" />

          <!-- Choices skeleton -->
          <div class="mb-l">
            <div v-for="n in 3" :key="n" class="choice-skeleton">
              <Skeleton :height="56" :radius="8" />
            </div>
          </div>

          <!-- Comment input skeleton -->
          <Skeleton :height="40" :radius="8" class="mb-l" />

          <!-- Buttons skeleton -->
          <Flex gap="s" y-center>
            <Skeleton :width="120" :height="40" :radius="8" />
            <Skeleton :width="100" :height="40" :radius="8" />
          </Flex>
        </Card>
      </section>

      <!-- Results section skeleton -->
      <section>
        <Card class="p-l">
          <Skeleton :width="80" :height="24" :radius="4" class="mb-m" />
          <Skeleton :height="120" :radius="8" />
        </Card>
      </section>
    </div>

    <!-- Referendum not found -->
    <Flex v-else-if="!referendum" column class="text-center p-xl" x-center y-center>
      <Icon name="ph:question" size="3rem" class="text-color-light mb-m" />
      <h2>Referendum not found</h2>
      <p class="text-color-light mb-l">
        The referendum you're looking for doesn't exist or has been removed.
      </p>
      <Button @click="router.push('/votes')">
        <template #start>
          <Icon name="ph:arrow-left" />
        </template>
        Back to Votes
      </Button>
    </Flex>

    <!-- Referendum content -->
    <template v-else>
      <!-- Back Button -->
      <Flex class="mb-m">
        <Button
          variant="gray"
          size="s"
          aria-label="Go back to Votes page"
          @click="router.push('/votes')"
        >
          <template #start>
            <Icon name="ph:arrow-left" />
          </template>
          Back to Votes
        </Button>
      </Flex>

      <!-- Header -->
      <section>
        <Flex :gap="0" expand column class="mb-l">
          <Flex y-start x-between gap="xl" expand>
            <h1>
              {{ referendum.title }}
            </h1>
            <UserDisplay :user-id="referendum.created_by" show-role />
          </Flex>

          <p v-if="referendum.description" class="text-xl text-color-light">
            {{ referendum.description }}
          </p>

          <Flex x-between y-center expand class="mt-m">
            <Flex gap="xs">
              <Badge :variant="statusVariant">
                {{ statusLabel }}
              </Badge>

              <Badge v-if="referendum.multiple_choice">
                Multiple Choice
              </Badge>
              <Badge v-else>
                Single Choice
              </Badge>

              <Badge v-if="!isUpcoming">
                {{ totalVoters }} vote{{ totalVoters !== 1 ? 's' : '' }}
              </Badge>
            </Flex>
            <Flex v-if="isActive" gap="s" y-center>
              <Icon name="ph:clock" />
              <p class="flex align-center text-s text-color-light">
                {{ timeRemaining }}
              </p>
            </Flex>
            <Flex v-else-if="isUpcoming" gap="s" y-center>
              <Icon name="ph:calendar" />
              <p class="text-s text-color-light">
                {{ timeUntilStart }}
              </p>
            </Flex>
          </Flex>
        </Flex>
      </section>

      <!-- Voting Section -->
      <section v-if="isActive && user" class="mb-xl">
        <Card class="p-l">
          <h3 class="mb-m">
            Cast Your Vote
          </h3>

          <div class="choices-voting mb-l">
            <div
              v-for="(choice, index) in referendum.choices"
              :key="index"
              class="choice-voting"
              :class="{ selected: selectedChoices.includes(index) }"
            >
              <Checkbox
                v-if="referendum.multiple_choice"
                :model-value="selectedChoices.includes(index)"
                :label="choice"
                @update:model-value="(value) => updateMultipleChoice(index, value)"
              />
              <Radio
                v-else
                :model-value="selectedChoices[0]"
                :value="index"
                :label="choice"
                @update:model-value="updateSingleChoice"
              />
            </div>
          </div>

          <Input
            v-model="comment"
            expand
            placeholder="Add a comment (optional)"
            class="mb-l"
          />

          <Flex y-center x-between expand>
            <Flex gap="s" y-center wrap>
              <Button
                variant="accent"
                :disabled="selectedChoices.length === 0 || isSubmitting"
                :loading="isSubmitting"
                @click="submitVote"
              >
                <template #start>
                  <Icon name="ph:check" />
                </template>
                {{ hasVoted ? 'Update Vote' : 'Submit Vote' }}
              </Button>

              <Button
                v-if="hasVoted"
                variant="danger"
                :disabled="isSubmitting || isRemovingVote"
                :loading="isRemovingVote"
                @click="requestRemoveVote"
              >
                <template #start>
                  <Icon name="ph:trash" />
                </template>
                Remove Vote
              </Button>
            </Flex>

            <Flex gap="s" y-center>
              <Icon name="ph:check-circle" class="text-color-success" />
              <span v-if="hasVoted" class="text-s color-accent flex items-center">
                You have voted
              </span>
            </Flex>
          </Flex>
        </Card>
      </section>

      <!-- Login prompt -->
      <section v-else-if="isActive && !user" class="mb-xl">
        <Card class="p-l text-center">
          <Icon name="ph:sign-in" size="2rem" class="text-color-light mb-m" />
          <h3 class="mb-s">
            Sign in to vote
          </h3>
          <p class="text-color-light mb-l">
            You need to be logged in to participate in this referendum.
          </p>
          <Button variant="accent" @click="navigateTo('/auth/login')">
            Sign In
          </Button>
        </Card>
      </section>

      <!-- Results Section -->
      <section>
        <!-- Hidden results message -->
        <Card v-if="!shouldShowResults" class="p-l">
          <Flex x-between y-center class="mb-m">
            <h3>
              Results
            </h3>
            <!-- Show reveal button if user hasn't voted and referendum is active -->
            <Button
              v-if="!shouldShowResults && isActive"
              variant="gray"
              size="s"
              @click="requestRevealResults"
            >
              <template #start>
                <Icon name="ph:eye" />
              </template>
              Reveal Results
            </Button>
          </Flex>

          <div class="text-center p-l">
            <Icon name="ph:eye-slash" size="2rem" class="text-color-light mb-s" />
            <h4 class="mb-s">
              {{ isUpcoming ? 'Referendum hasn\'t started' : 'Results require a vote' }}
            </h4>
            <p v-if="isUpcoming" class="text-color-light">
              Results will be available once voting opens.
            </p>
            <p v-else class="text-color-light">
              Vote to see the current results, or reveal them early using the button above.
            </p>
          </div>
        </Card>

        <!-- Loading results -->
        <Card v-else-if="isLoadingResults" class="p-l">
          <Flex x-between y-center class="mb-m">
            <Skeleton :width="80" :height="24" :radius="4" />
          </Flex>
          <div class="results-skeleton">
            <div v-for="n in 3" :key="n" class="result-skeleton">
              <Flex x-between y-center class="mb-xs">
                <Skeleton :width="150" :height="16" :radius="4" />
                <Skeleton :width="60" :height="16" :radius="4" />
              </Flex>
              <Skeleton :height="8" :radius="4" class="mb-xs" />
              <Skeleton :width="40" :height="14" :radius="4" />
            </div>
          </div>
        </Card>

        <!-- Actual results -->
        <ReferendumResults
          v-else-if="referendum && allVotes"
          :referendum="referendum"
          :votes="allVotes"
        />
      </section>

      <!-- Reveal Results Confirmation Modal -->
      <ConfirmModal
        v-model:open="showConfirmModal"
        v-model:confirm="confirmRevealResults"
        title="Reveal Results Early?"
        description="You haven't voted yet. Are you sure you want to see the current results? This action cannot be undone."
        confirm-text="Yes, Reveal Results"
        cancel-text="Cancel"
        :destructive="false"
      />

      <!-- Remove Vote Confirmation Modal -->
      <ConfirmModal
        v-model:open="showRemoveVoteModal"
        v-model:confirm="confirmRemoveVote"
        title="Remove Your Vote?"
        description="Are you sure you want to remove your vote? You can always vote again later while the referendum is active."
        confirm-text="Yes, Remove Vote"
        cancel-text="Cancel"
        :destructive="true"
      />
    </template>
  </div>
</template>

<style lang="scss" scoped>
.loading-skeleton {
  .choice-skeleton {
    margin-bottom: var(--space-s);
  }
}

.results-skeleton {
  .result-skeleton {
    margin-bottom: var(--space-l);

    &:last-child {
      margin-bottom: 0;
    }
  }
}

.choices-voting {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

.choice-voting {
  padding: var(--space-m);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background-color: var(--color-bg-lowered);
    border-color: var(--color-accent);
  }

  &.selected {
    background-color: var(--color-accent-bg);
    border-color: var(--color-accent);
  }
}
</style>
