<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Button, Divider, Flex, Tooltip } from '@dolanske/vui'
import EventGames from '@/components/Events/EventGames.vue'
import Reactions from '@/components/Reactions/Reactions.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import { useCache } from '@/composables/useCache'
import { useDataUser } from '@/composables/useDataUser'
import { useExternalLinkGuard } from '@/composables/useExternalLinkGuard'
import { useRealtimeRsvp } from '@/composables/useRealtimeRsvp'
import { useRsvpBus } from '@/composables/useRsvpBus'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'
import { useBreakpoint } from '@/lib/mediaQuery'
import { formatDurationFromMinutes } from '@/lib/utils/duration'
import { humanizeRrule, isSeriesActive, nextOccurrenceDate } from '@/lib/utils/rrule'
import CountdownTimer from './CountdownTimer.vue'
import EventRSVPCount from './EventRSVPCount.vue'
import EventRSVPModal from './EventRSVPModal.vue'
import RSVPButton from './RSVPButton.vue'

interface Props {
  event: Tables<'events'>
  games?: Tables<'games'>[]
  discussionId?: string | null
  discussionReactions?: unknown
  isUpcoming: boolean
  isOngoing?: boolean
  countdown?: {
    days: number
    hours: number
    minutes: number
    seconds: number
  } | null
  timeAgo?: string
}

const props = defineProps<Props>()

// TODO: would be nice to show how many comments there are and add a badge that
// when clicked scrolls down to the comments

const isMobile = useBreakpoint('<s')

const { handleContentClick } = useExternalLinkGuard()

// Parse timeAgo string (e.g. "3 days ago") into number + label parts
const timeAgoParts = computed(() => {
  if (!props.timeAgo)
    return null
  const match = props.timeAgo.match(/^(\d+) ([a-z]+) ago$/i)
  if (!match)
    return { number: props.timeAgo, label: '' }
  return { number: match[1], label: match[2] }
})

const isBelowSmall = useBreakpoint('<s')

// For recurring series, display the next upcoming occurrence date rather than
// the stored origin date. If the series has ended (UNTIL passed), fall back
// to the origin date so something is always shown.
const displayDate = computed(() => {
  if (props.event.recurrence_rule) {
    const next = nextOccurrenceDate(props.event)
    if (next)
      return next.toISOString()
  }
  return props.event.date
})

const seriesStillActive = computed(() => isSeriesActive(props.event))

// Parse UNTIL from the recurrence_rule for display
const seriesUntilDate = computed<string | null>(() => {
  const rule = props.event.recurrence_rule
  if (!rule)
    return null
  const match = rule.match(/UNTIL=(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/)
  if (!match)
    return null
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`
})

// Get current user for authentication checks
const user = useSupabaseUser()

// Fetch organizer profile to check public visibility
const { user: organizer } = useDataUser(
  computed(() => props.event.created_by ?? null),
  { includeRole: false, includeAvatar: false },
)

const showOrganizer = computed(() => !!user.value || organizer.value?.isPublic === true)

// State for RSVP modal
const showRSVPModal = ref(false)

// State for RSVP counts
const supabase = useSupabaseClient()
const rsvpCountsCache = useCache(CACHE_NAMESPACES.rsvps)

interface RsvpCountsEntry { yes: number, tentative: number, no: number, total: number }

const rsvpCounts = ref<RsvpCountsEntry>({
  yes: 0,
  tentative: 0,
  no: 0,
  total: 0,
})

// Fetch RSVP counts
async function fetchRSVPCounts(force = false) {
  if (!props.event?.id)
    return

  const eventId = props.event.id
  const cacheKey = `rsvp:counts:${eventId}`

  if (!force) {
    const cached = rsvpCountsCache.get<RsvpCountsEntry>(cacheKey)
    if (cached !== null) {
      rsvpCounts.value = cached
      return
    }
  }

  try {
    const [yesResult, tentativeResult, noResult] = await Promise.all([
      supabase.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('event_id', eventId).eq('rsvp', 'yes'),
      supabase.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('event_id', eventId).eq('rsvp', 'tentative'),
      supabase.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('event_id', eventId).eq('rsvp', 'no'),
    ])

    if (yesResult.error)
      throw yesResult.error
    if (tentativeResult.error)
      throw tentativeResult.error
    if (noResult.error)
      throw noResult.error

    const yes = yesResult.count ?? 0
    const tentative = tentativeResult.count ?? 0
    const no = noResult.count ?? 0
    const counts: RsvpCountsEntry = { yes, tentative, no, total: yes + tentative + no }

    rsvpCounts.value = counts
    rsvpCountsCache.set(cacheKey, counts)
  }
  catch (error) {
    console.error('Error fetching RSVP counts:', error)
  }
}

const { onRsvpUpdated } = useRsvpBus()

onRsvpUpdated(({ eventId }) => {
  if (eventId === props.event.id) {
    void fetchRSVPCounts(true)
  }
})

// Subscribe to cross-tab realtime RSVP changes for this event.
// useRsvpBus.onRsvpUpdated is already wired in EventRSVPCount and
// EventRSVPModal, so dispatching through the bus here is enough to
// keep all child components in sync without any further changes.
useRealtimeRsvp(computed(() => props.event?.id ?? null))

onMounted(() => {
  fetchRSVPCounts()
})
</script>

<template>
  <Flex column expand gap="l" class="event-header">
    <!-- Title and actions row -->
    <Flex
      :x-between="!isBelowSmall"
      :x-center="isBelowSmall"
      :row="!isBelowSmall"
      :column-reverse="isBelowSmall"
      :y-start="!isBelowSmall"
      :y-center="isBelowSmall"
      expand
      gap="l"
      class="event-header__title-row"
    >
      <Flex
        column
        :y-center="isBelowSmall"
        :y-start="!isBelowSmall"
        class="event-header__title-section"
        :style="{ textAlign: isBelowSmall ? 'center' : 'left',
                  width: isBelowSmall ? '100%' : undefined }"
      >
        <h1 class="event-header__title" :class=" isBelowSmall ? 'text-xxl' : 'text-xxxl' ">
          {{ props.event.title }}
        </h1>
        <p v-if="event.description" class="event-header__description">
          {{ props.event.description }}
        </p>
        <!-- Games Section -->
        <template v-if="games && games.length > 0">
          <EventGames :games="games" :show-label="false" />
        </template>
      </Flex>

      <!-- Timing/Countdown Section -->
      <Flex
        column
        :y-center="isBelowSmall"
        :y-end="!isBelowSmall"
        gap="s"
        class="event-header__timing-section"
        :style="{ width: isBelowSmall ? '100%' : undefined }"
      >
        <!-- Enhanced Countdown for upcoming events or NOW for ongoing -->
        <CountdownTimer
          v-if="isUpcoming || isOngoing"
          :countdown="countdown"
          :is-ongoing="isOngoing"
          :created-at="props.event.created_at"
        >
          <Flex column y-center gap="xxs" class="event-header__countdown-date">
            <Flex y-center gap="xxs">
              <TimestampDate size="xxs" :date="displayDate" format="dddd, MMMM D, YYYY [at] HH:mm" />
              <span v-if="props.event.duration_minutes" class="text-xxs">
                for {{ formatDurationFromMinutes(props.event.duration_minutes) }}
              </span>
            </Flex>
            <Flex v-if="props.event.recurrence_rule && isBelowSmall" y-center gap="xs" class="event-header__countdown-series">
              <Icon name="ph:arrows-clockwise" size="12" />
              <span class="text-xxs">
                Series from <TimestampDate :date="props.event.date" format="MMM D, YYYY" size="xxs" class="inline" />
                <template v-if="seriesUntilDate">
                  to <TimestampDate :date="seriesUntilDate" format="MMM D, YYYY" size="xxs" class="inline" />
                </template>
                <template v-else-if="seriesStillActive">
                  - ongoing
                </template>
              </span>
            </Flex>
          </Flex>
        </CountdownTimer>

        <!-- Time ago for past events - styled like CountdownTimer -->
        <div v-else-if="!isUpcoming && !isOngoing && timeAgo" class="countdown-timer countdown-timer--past">
          <Flex gap="s" y-center x-center>
            <Flex column y-center x-center gap="xxs" class="countdown-timer__item">
              <div class="countdown-timer__number-wrapper">
                <span class="countdown-timer__number">{{ timeAgoParts?.number }}</span>
              </div>
              <span class="countdown-timer__label">{{ timeAgoParts?.label }} ago</span>
            </Flex>
          </Flex>
          <Flex x-center class="mt-xs">
            <Flex column y-center gap="xxs" class="event-header__countdown-date">
              <Flex y-center gap="xxs">
                <TimestampDate size="xxs" :date="displayDate" format="dddd, MMMM D, YYYY [at] HH:mm" />
                <span v-if="props.event.duration_minutes" class="text-xxs">
                  for {{ formatDurationFromMinutes(props.event.duration_minutes) }}
                </span>
              </Flex>
              <Flex v-if="props.event.recurrence_rule && isBelowSmall" y-center gap="xs" class="event-header__countdown-series">
                <Icon name="ph:arrows-clockwise" size="12" />
                <span class="text-xxs">
                  Series from <TimestampDate :date="props.event.date" format="MMM D, YYYY" size="xxs" class="inline" />
                  <template v-if="seriesUntilDate">
                    to <TimestampDate :date="seriesUntilDate" format="MMM D, YYYY" size="xxs" class="inline" />
                  </template>
                  <template v-else-if="seriesStillActive">
                    - ongoing
                  </template>
                </span>
              </Flex>
            </Flex>
          </Flex>
        </div>
      </Flex>
    </Flex>

    <!-- Organizer and reactions -->
    <Flex v-if="showOrganizer || discussionId" expand :x-between="!isMobile" y-center gap="m" class="event-header__organizer" :column="isMobile">
      <Flex v-if="showOrganizer" y-center gap="xs">
        <span class="event-header__organizer-label">Organized by</span>
        <UserDisplay :user-id="event.created_by" size="s" :show-profile-preview="true" :hide-avatar="false" />
      </Flex>
      <Reactions
        v-if="discussionId"
        style="justify-content: center; margin-left: 0px"
        table="discussions"
        :row-id="discussionId"
        :reactions="discussionReactions"
      />
    </Flex>

    <Divider />

    <!-- Event meta information -->
    <Flex gap="m" x-between expand :column="isBelowSmall">
      <Flex :gap="isBelowSmall ? 'xxs' : 's'" wrap class="event-header__badges-section" :x-center="isBelowSmall" :expand="isBelowSmall">
        <Badge v-if="props.event.is_official" variant="accent">
          <Icon name="ph:star-fill" />
          Official
        </Badge>

        <Badge v-if="props.event.location" variant="neutral">
          <Icon name="ph:map-pin-fill" />
          {{ props.event.location }}
        </Badge>

        <Tooltip v-if="props.event.note && !isBelowSmall" placement="bottom">
          <template #tooltip>
            <div class="event-header__tooltip-content">
              {{ props.event.note }}
            </div>
          </template>
          <Badge variant="neutral" class="event-header__note-badge">
            <Icon name="ph:note" />
            Note
          </Badge>
        </Tooltip>
        <Badge v-else-if="props.event.note" variant="neutral">
          <Icon name="ph:note" />
          {{ props.event.note }}
        </Badge>

        <Tooltip v-if="props.event.recurrence_rule && !isBelowSmall" placement="bottom">
          <template #tooltip>
            <span class="text-xxs">
              Series from <TimestampDate :date="props.event.date" format="MMM D, YYYY" size="xxs" class="inline" />
              <template v-if="seriesUntilDate">
                to <TimestampDate :date="seriesUntilDate" format="MMM D, YYYY" size="xxs" class="inline" />
              </template>
              <template v-else-if="seriesStillActive">
                - ongoing
              </template>
            </span>
          </template>
          <Badge variant="neutral" class="event-header__note-badge">
            <Icon name="ph:arrows-clockwise" />
            {{ humanizeRrule(props.event.recurrence_rule) }}
          </Badge>
        </Tooltip>
        <Badge v-else-if="props.event.recurrence_rule" variant="neutral">
          <Icon name="ph:arrows-clockwise" />
          {{ humanizeRrule(props.event.recurrence_rule) }}
        </Badge>

        <!-- RSVP Count Badge -->
        <EventRSVPCount :event="props.event" variant="accent" size="l" :show-when-zero="false" />
      </Flex>

      <Flex gap="xs" class="event-header__actions" :x-center="isBelowSmall" :expand="isBelowSmall" wrap>
        <!-- RSVP button -->
        <RSVPButton :event="props.event" :size="isBelowSmall ? 'm' : 's'" />

        <!-- View RSVPs button -->
        <Button
          v-if="user"
          :size="isBelowSmall ? 'm' : 's'"
          @click="showRSVPModal = true"
        >
          <template #start>
            <Icon name="ph:users" />
          </template>
          View RSVPs
        </Button>

        <!-- External Link -->
        <NuxtLink
          v-if="event.link"
          :to="event.link"
          target="_blank"
          rel="noopener noreferrer"
          @click="handleContentClick"
        >
          <Button :size="isBelowSmall ? 'm' : 's'">
            <template #start>
              <Icon name="ph:link" />
            </template>
            Open Link
          </Button>
        </NuxtLink>
      </Flex>
    </Flex>

    <!-- RSVP Modal -->
    <EventRSVPModal
      v-model:open="showRSVPModal"
      :event="event"
      @close="showRSVPModal = false"
    />
  </Flex>
</template>

<style lang="scss">
@use '@/assets/breakpoints.scss' as *;

.event-header {
  &--ongoing {
    background: linear-gradient(135deg, var(--color-accent-muted), transparent);
  }

  &__title-row {
    align-items: flex-start;
  }

  &__title-section {
    flex: 1;
  }

  &__title {
    font-weight: var(--font-weight-bold);
    margin: 0;
    line-height: 1.2;
  }

  &__organizer {
    margin-top: var(--space-xs);

    &-label {
      font-size: var(--font-size-s);
      color: var(--color-text-lighter);
    }
  }

  &__description {
    font-size: var(--font-size-l);
    color: var(--color-text-light);
    line-height: 1.5;

    @media (max-width: $breakpoint-s) {
      font-size: var(--font-size-m);
      text-align: center;
    }
  }

  &__timing-section {
    min-width: fit-content;
  }

  &__countdown-date {
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-light);
    gap: 0.35rem !important;
  }

  &__countdown-series {
    color: var(--color-text-lighter);
    opacity: 0.8;
  }

  &__badges-section {
    align-items: center;
  }

  &__note-badge {
    cursor: help;
    transition: all 0.2s ease;
  }

  &__tooltip-content {
    max-width: 250px;
    font-size: var(--font-size-s);
    line-height: 1.4;
  }
}
</style>
