<script setup lang="ts">
import type { useDataLinkPreview } from '@/composables/useDataLinkPreview'
import type { Database } from '@/types/database.types'
import { Badge, Button, Flex } from '@dolanske/vui'
import { useIntervalFn } from '@vueuse/core'
import { resolveComponent } from 'vue'
import TinyBadge from '@/components/Shared/TinyBadge.vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import { formatDuration } from '@/lib/utils/duration'

type VoteData = NonNullable<ReturnType<typeof useDataLinkPreview>['data']['value']> & { type: 'vote' }

const props = defineProps<{
  data: VoteData
}>()

const NuxtLink = resolveComponent('NuxtLink')

const isMobile = useBreakpoint('<s')

const now = ref(new Date())
useIntervalFn(() => {
  now.value = new Date()
}, 1_000, { immediate: true })

const voteStatus = computed(() => props.data.status)

const voteStatusVariant = computed(() => {
  if (voteStatus.value === 'active')
    return 'info' as const
  if (voteStatus.value === 'upcoming')
    return 'warning' as const
  return 'neutral' as const
})

const voteStatusLabel = computed(() => {
  if (voteStatus.value === 'active') {
    if (props.data.dateEnd == null)
      return 'Active'
    const diff = new Date(props.data.dateEnd).getTime() - now.value.getTime()
    if (diff <= 0)
      return 'Concluded'
    const formatted = formatDuration(diff)
    return formatted ? `${formatted} left` : 'Less than 1 minute left'
  }
  if (voteStatus.value === 'upcoming')
    return 'Upcoming'
  return 'Concluded'
})

const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const userId = useUserId()

const selectedChoices = ref<number[]>([])
const isSubmitting = ref(false)
const isRemoving = ref(false)
const hasVoted = ref(false)
const voteId = ref<number | null>(null)
const localVoteCount = ref<number | null>(null)
const allVotes = ref<Array<{ choices: number[] }>>([])

const displayVoteCount = computed(() => localVoteCount.value ?? props.data.voteCount)

const choiceStats = computed(() => {
  const total = allVotes.value.length
  return props.data.choices.map((_, i) => {
    const count = allVotes.value.filter(v => (v.choices as Array<number | string>).map(Number).includes(i)).length
    const pct = total > 0 ? Math.round((count / total) * 100) : 0
    return { count, pct }
  })
})

async function fetchAllVotes(referendumId: number) {
  const { data: votes } = await supabase
    .from('referendum_votes')
    .select('choices')
    .eq('referendum_id', referendumId)
  allVotes.value = (votes ?? []) as Array<{ choices: number[] }>
  localVoteCount.value = allVotes.value.length
}

watch(
  [() => props.data, () => userId.value],
  async ([d]) => {
    if (!userId.value)
      return
    const { data: existing } = await supabase
      .from('referendum_votes')
      .select('id, choices')
      .eq('referendum_id', d.referendumId)
      .eq('user_id', userId.value)
      .maybeSingle()
    if (existing != null) {
      hasVoted.value = true
      voteId.value = existing.id
      selectedChoices.value = (existing.choices as Array<number | string>).map(Number)
      await fetchAllVotes(d.referendumId)
    }
    else if (d.status === 'concluded') {
      await fetchAllVotes(d.referendumId)
    }
  },
  { immediate: true },
)

function toggleChoice(index: number) {
  if (props.data.multipleChoice) {
    const pos = selectedChoices.value.indexOf(index)
    if (pos > -1)
      selectedChoices.value.splice(pos, 1)
    else
      selectedChoices.value.push(index)
  }
  else {
    selectedChoices.value = [index]
    void submitVote()
  }
}

async function submitVote() {
  if (!user.value || selectedChoices.value.length === 0)
    return
  isSubmitting.value = true
  hasVoted.value = true
  try {
    const payload = {
      referendum_id: props.data.referendumId,
      user_id: userId.value ?? undefined,
      choices: selectedChoices.value,
    }
    const { data: upserted, error } = await supabase
      .from('referendum_votes')
      .upsert(payload, { onConflict: 'referendum_id,user_id' })
      .select('id')
      .maybeSingle()
    if (error)
      throw error
    if (upserted != null)
      voteId.value = upserted.id
    await fetchAllVotes(props.data.referendumId)
  }
  catch (err) {
    console.error('Error submitting vote from embed:', err)
    hasVoted.value = false
  }
  finally {
    isSubmitting.value = false
  }
}

async function removeVote() {
  if (!voteId.value)
    return
  isRemoving.value = true
  try {
    const { error } = await supabase
      .from('referendum_votes')
      .delete()
      .eq('id', voteId.value)
    if (error)
      throw error
    hasVoted.value = false
    voteId.value = null
    selectedChoices.value = []
    await fetchAllVotes(props.data.referendumId)
  }
  catch (err) {
    console.error('Error removing vote from embed:', err)
  }
  finally {
    isRemoving.value = false
  }
}
</script>

<template>
  <component
    :is="data.status === 'concluded' ? NuxtLink : 'div'"
    class="link-embed link-embed--vote"
    v-bind="data.status === 'concluded' ? { href: data.href } : {}"
  >
    <Flex column gap="xs" class="link-embed__body link-embed__body--column">
      <Flex y-center gap="s" class="link-embed__header">
        <Icon name="ph:check-square" class="link-embed__icon" />
        <span class="link-embed__eyebrow">Vote</span>
      </Flex>

      <!-- Title links to the full vote page -->
      <NuxtLink :href="data.href" class="link-embed__title-link">
        <span class="link-embed__title">{{ data.title }}</span>
      </NuxtLink>

      <p v-if="data.description" class="link-embed__description">
        {{ data.description }}
      </p>

      <!-- Concluded: inline bar results -->
      <template v-if="data.status === 'concluded'">
        <div class="link-embed__vote-results">
          <div
            v-for="(choice, i) in data.choices"
            :key="i"
            class="link-embed__vote-result"
          >
            <div class="link-embed__vote-result-header">
              <span class="link-embed__vote-result-label">{{ choice }}</span>
              <span class="link-embed__vote-result-pct">{{ choiceStats[i]?.pct ?? 0 }}%</span>
            </div>
            <div class="link-embed__vote-result-bar-track">
              <div
                class="link-embed__vote-result-bar-fill"
                :style="{ width: `${choiceStats[i]?.pct ?? 0}%` }"
              />
            </div>
          </div>
        </div>
      </template>

      <!-- Sign-in nudge when not logged in -->
      <template v-else-if="!user">
        <Flex y-center x-between expand gap="m" class="link-embed__signin-nudge">
          <span class="link-embed__signin-nudge-text">Sign in to join this vote</span>
          <NuxtLink href="/sign-in" class="link-embed__signin-btn">
            <Button variant="gray" size="s">
              Sign in
            </Button>
          </NuxtLink>
        </Flex>
      </template>

      <!-- Interactive choices when active and logged in -->
      <template v-else-if="voteStatus === 'active' && user">
        <div class="link-embed__vote-choices" :class="{ 'link-embed__vote-choices--grid': !isMobile }">
          <button
            v-for="(choice, i) in data.choices"
            :key="i"
            class="link-embed__vote-choice"
            :class="{ 'link-embed__vote-choice--selected': selectedChoices.includes(i) }"
            :disabled="isSubmitting || isRemoving"
            @click.prevent="toggleChoice(i)"
          >
            <Icon
              :name="data.multipleChoice
                ? (selectedChoices.includes(i) ? 'ph:check-square-fill' : 'ph:square')
                : (selectedChoices.includes(i) ? 'ph:radio-button-fill' : 'ph:circle')"
              class="link-embed__vote-choice-icon"
              :class="{ 'link-embed__vote-choice-icon--checked': selectedChoices.includes(i) }"
            />
            <span class="link-embed__vote-choice-label">{{ choice }}</span>
            <span v-if="hasVoted && choiceStats[i]" class="link-embed__vote-choice-pct">
              {{ choiceStats[i].pct }}%
            </span>
          </button>
        </div>
        <!-- Action buttons: mobile only (desktop shows in meta row) -->
        <template v-if="voteStatus === 'active' && user && isMobile">
          <!-- Single choice: full-width remove on mobile -->
          <template v-if="!data.multipleChoice && hasVoted">
            <Button
              variant="danger"
              size="s"
              outline
              expand
              :loading="isRemoving"
              :disabled="isRemoving"
              class="link-embed__vote-actions"
              @click.prevent="removeVote"
            >
              <template #start>
                <Icon name="ph:x" />
              </template>
              Remove vote
            </Button>
          </template>
          <!-- Multi-choice: side-by-side remove + submit on mobile -->
          <template v-if="data.multipleChoice && (hasVoted || selectedChoices.length > 0)">
            <Flex gap="s" class="link-embed__vote-actions" expand>
              <Button
                v-if="hasVoted"
                expand
                variant="danger"
                size="s"
                outline
                :loading="isRemoving"
                :disabled="isRemoving"
                @click.prevent="removeVote"
              >
                <template #start>
                  <Icon name="ph:x" />
                </template>
                Remove vote
              </Button>
              <Button
                v-if="selectedChoices.length > 0"
                expand
                variant="accent"
                size="s"
                :loading="isSubmitting"
                :disabled="isSubmitting"
                @click.prevent="submitVote"
              >
                <template #start>
                  <Icon name="ph:check" />
                </template>
                {{ hasVoted ? 'Update vote' : 'Submit vote' }}
              </Button>
            </Flex>
          </template>
        </template>
      </template>

      <!-- Read-only choices list when not active or not logged in -->
      <ul v-else-if="data.choices.length > 0" class="link-embed__choices" :class="{ 'link-embed__choices--grid': !isMobile }">
        <li
          v-for="(choice, i) in data.choices.slice(0, 4)"
          :key="i"
          class="link-embed__choice"
        >
          <Icon name="ph:circle" class="link-embed__choice-icon" />
          <span>{{ choice }}</span>
        </li>
        <li v-if="data.choices.length > 4" class="link-embed__choice link-embed__choice--more link-embed__choice--span-full">
          +{{ data.choices.length - 4 }} more
        </li>
      </ul>

      <Flex v-if="user" y-center gap="s" class="link-embed__meta">
        <component :is="isMobile ? TinyBadge : Badge" :variant="voteStatusVariant" size="xs">
          {{ voteStatusLabel }}
        </component>
        <span class="link-embed__meta-sep">&middot;</span>
        <span class="link-embed__meta-item">
          {{ displayVoteCount }} {{ displayVoteCount === 1 ? 'vote' : 'votes' }}
        </span>
        <template v-if="data.multipleChoice">
          <span class="link-embed__meta-sep">&middot;</span>
          <span class="link-embed__meta-item">Multiple choice</span>
        </template>
        <!-- Desktop: inline action buttons in meta row -->
        <template v-if="voteStatus === 'active' && user && !isMobile">
          <template v-if="hasVoted">
            <span class="link-embed__meta-sep">&middot;</span>
            <Button
              variant="danger"
              size="s"
              plain
              :loading="isRemoving"
              :disabled="isRemoving"
              @click.prevent="removeVote"
            >
              <template #start>
                <Icon name="ph:x" />
              </template>
              Remove vote
            </Button>
          </template>
          <template v-if="data.multipleChoice && selectedChoices.length > 0">
            <span class="link-embed__meta-sep">&middot;</span>
            <Button
              variant="accent"
              size="s"
              plain
              :loading="isSubmitting"
              :disabled="isSubmitting"
              @click.prevent="submitVote"
            >
              <template #start>
                <Icon name="ph:check" />
              </template>
              {{ hasVoted ? 'Update vote' : 'Submit vote' }}
            </Button>
          </template>
        </template>
      </Flex>
    </Flex>
  </component>
</template>

<style scoped lang="scss">
.link-embed__title-link {
  text-decoration: none;
  color: inherit;

  &:hover .link-embed__title {
    text-decoration: underline;
    text-decoration-color: var(--color-border-strong);
  }
}

.link-embed__vote-choices {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-top: var(--space-xxs);
  width: 100%;

  &--grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
  }
}

.link-embed__vote-choice {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  padding: var(--space-xs) var(--space-s);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-s);
  background: transparent;
  cursor: pointer;
  font-size: var(--font-size-xs);
  color: var(--color-text);
  text-align: left;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast);

  &:hover:not(:disabled) {
    background-color: var(--color-bg-medium);
    border-color: var(--color-accent);
  }

  &--selected {
    background-color: var(--color-bg-accent-lowered);
    border-color: var(--color-accent);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &-icon {
    flex-shrink: 0;
    color: var(--color-text);
  }
}

.link-embed__vote-choice-label {
  flex: 1;
  color: var(--color-text);
}

.link-embed__vote-choice-pct {
  margin-left: auto;
  font-size: var(--font-size-xxs);
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.link-embed__vote-actions {
  margin-top: var(--space-xxs);
}

.link-embed__vote-results {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-top: var(--space-xxs);
  width: 100%;
}

.link-embed__vote-result {
  display: flex;
  flex-direction: column;
  gap: var(--space-xxs);
}

.link-embed__vote-result-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-s);
}

.link-embed__vote-result-label {
  font-size: var(--font-size-xs);
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.link-embed__vote-result-bar-track {
  width: 100%;
  height: 6px;
  border-radius: var(--border-radius-xs);
  background-color: var(--color-bg);
  overflow: hidden;
}

.link-embed__vote-result-bar-fill {
  height: 100%;
  border-radius: var(--border-radius-xs);
  background-color: var(--color-accent);
  transition: width var(--transition-slow);
}

.link-embed__vote-result-pct {
  font-size: var(--font-size-xxs);
  color: var(--color-text-light);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.link-embed__choices {
  list-style: none;
  margin: var(--space-xxs) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xxs);
  width: 100%;

  &--grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
  }
}

.link-embed__choice {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--font-size-xs);
  color: var(--color-text-light);

  &-icon {
    color: var(--color-text-lighter);
    font-size: 0.65rem;
    flex-shrink: 0;
  }

  &--more {
    color: var(--color-text-lighter);
    font-style: italic;
    padding-left: calc(0.65rem + var(--space-xs));
  }

  &--span-full {
    grid-column: 1 / -1;
  }
}
.link-embed__signin-nudge {
  width: 100%;
}

.link-embed__signin-nudge-text {
  font-size: var(--font-size-xs);
  color: var(--color-text-lighter);
}

.link-embed__signin-btn {
  text-decoration: none;
  flex-shrink: 0;
}
</style>
