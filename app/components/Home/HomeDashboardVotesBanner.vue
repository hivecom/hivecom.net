<script setup lang="ts">
import { Badge, Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useDataVotes } from '@/composables/useDataVotes'

dayjs.extend(relativeTime)

// Priority: a vote you still have to cast, a running vote you've cast, then the
// latest result when nothing is live. With none of those it doesn't render.

const RESULTS_WINDOW_DAYS = 30

const {
  activePublicItems,
  concludedPublicItems,
  fetchActivePublicPage,
  fetchConcludedPublicPage,
  fetchUserVotedIds,
  fetchVoteCounts,
  getVoteCount,
  hasVoted,
} = useDataVotes()

onMounted(() => {
  void fetchActivePublicPage()
  void fetchConcludedPublicPage()
  void fetchUserVotedIds()
})

// Immediate, since a warm cache fills both lists during setup and a plain watcher never fires
watch([activePublicItems, concludedPublicItems], ([active, concluded]) => {
  const ids = [...active, ...concluded].map(r => r.id)
  if (ids.length > 0)
    void fetchVoteCounts(ids)
}, { immediate: true })

// The active list includes votes that haven't opened yet
const inProgress = computed(() => activePublicItems.value.filter(r => dayjs(r.date_start).isBefore(dayjs())))

const needsDeciding = computed(() => inProgress.value.filter(r => !hasVoted(r.id)))
const alreadyVoted = computed(() => inProgress.value.filter(r => hasVoted(r.id)))

const latestResult = computed(() => {
  const cutoff = dayjs().subtract(RESULTS_WINDOW_DAYS, 'day')

  return concludedPublicItems.value
    .filter(r => dayjs(r.date_end).isAfter(cutoff))
    .sort((a, b) => dayjs(b.date_end).valueOf() - dayjs(a.date_end).valueOf())[0]
})

type BannerState = 'deciding' | 'voted' | 'result'

const referendum = computed(() => needsDeciding.value[0] ?? alreadyVoted.value[0] ?? latestResult.value)

const state = computed<BannerState | null>(() => {
  if (needsDeciding.value.length)
    return 'deciding'
  if (alreadyVoted.value.length)
    return 'voted'

  return latestResult.value ? 'result' : null
})

const remaining = computed(() => Math.max(0, inProgress.value.length - 1))

const label = computed(() => {
  if (state.value === 'deciding')
    return 'Needs your vote'
  if (state.value === 'voted')
    return 'You voted, still running'

  return 'Latest result'
})

const detail = computed(() => {
  if (!referendum.value)
    return ''

  if (state.value === 'result')
    return `Concluded ${dayjs(referendum.value.date_end).fromNow()}`

  return `Ends ${dayjs(referendum.value.date_end).fromNow()}`
})
</script>

<template>
  <NuxtLink
    v-if="state && referendum"
    :to="`/votes/${referendum.id}`"
    class="votes-banner"
    :class="`votes-banner--${state}`"
  >
    <Icon name="ph:gavel" class="votes-banner__icon" />

    <Flex y-center gap="s" wrap class="votes-banner__body">
      <span class="votes-banner__label">{{ label }}</span>
      <span class="votes-banner__title">{{ referendum.title }}</span>

      <Badge v-if="remaining" variant="neutral" size="s" outline>
        +{{ remaining }} more
      </Badge>
    </Flex>

    <span class="votes-banner__meta">{{ detail }}</span>
    <span class="votes-banner__meta votes-banner__meta--turnout">{{ getVoteCount(referendum.id) }} votes</span>

    <Icon name="ph:arrow-right" class="votes-banner__arrow" />
  </NuxtLink>
</template>

<style scoped lang="scss">
.votes-banner {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  padding: var(--space-s) var(--space-m);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  // Matches the VUI cards under it
  background-color: var(--color-bg);
  color: var(--color-text);
  transition:
    border-color var(--transition-fast),
    background-color var(--transition-fast);

  &:hover,
  &:focus-visible {
    border-color: var(--color-border-strong);

    .votes-banner__arrow {
      opacity: 1;
      transform: none;
    }
  }
}

// Only the state that wants something from you gets the accent. The others are news.
.votes-banner--deciding {
  border-color: var(--color-accent);

  .votes-banner__icon {
    color: var(--color-accent);
  }
}

.votes-banner__icon {
  font-size: 18px;
  flex-shrink: 0;
  color: var(--color-text-light);
}

.votes-banner__body {
  flex: 1;
  min-width: 0;
}

.votes-banner__label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-lighter);
  flex-shrink: 0;
}

.votes-banner__title {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-semibold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.votes-banner__meta {
  font-size: var(--font-size-xs);
  color: var(--color-text-lighter);
  flex-shrink: 0;
}

.votes-banner__arrow {
  font-size: 14px;
  flex-shrink: 0;
  opacity: 0;
  transform: translateX(-4px);
  transition:
    opacity var(--transition-duration) ease,
    transform var(--transition-duration) ease;
}

// Extras drop off before the title wraps
@media screen and (max-width: $breakpoint-m) {
  .votes-banner__meta--turnout,
  .votes-banner__arrow {
    display: none;
  }
}
</style>
