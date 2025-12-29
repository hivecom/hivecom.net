<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Button, Divider, Flex, Tooltip } from '@dolanske/vui'
import EventGames from '@/components/Events/EventGames.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import { formatDurationFromMinutes } from '@/lib/utils/duration'
import CountdownTimer from './CountdownTimer.vue'
import EventRSVPCount from './EventRSVPCount.vue'
import EventRSVPModal from './EventRSVPModal.vue'
import RSVPButton from './RSVPButton.vue'

interface Props {
  event: Tables<'events'>
  games?: Tables<'games'>[]
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

const isBelowSmall = useBreakpoint('<s')

// Get current user for authentication checks
const user = useSupabaseUser()

// State for RSVP modal
const showRSVPModal = ref(false)

// State for RSVP counts
const supabase = useSupabaseClient()
const rsvpCounts = ref({
  yes: 0,
  tentative: 0,
  no: 0,
  total: 0,
})

// Fetch RSVP counts
async function fetchRSVPCounts() {
  if (!props.event?.id)
    return

  try {
    const { count: yesCount } = await supabase
      .from('events_rsvps')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', props.event.id)
      .eq('rsvp', 'yes')

    const { count: tentativeCount } = await supabase
      .from('events_rsvps')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', props.event.id)
      .eq('rsvp', 'tentative')

    const { count: noCount } = await supabase
      .from('events_rsvps')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', props.event.id)
      .eq('rsvp', 'no')

    rsvpCounts.value = {
      yes: yesCount || 0,
      tentative: tentativeCount || 0,
      no: noCount || 0,
      total: (yesCount || 0) + (tentativeCount || 0) + (noCount || 0),
    }
  }
  catch (error) {
    console.error('Error fetching RSVP counts:', error)
  }
}

// Listen for RSVP updates
function handleRsvpUpdate(event: Event) {
  const customEvent = event as CustomEvent
  if (customEvent.detail?.eventId === props.event.id) {
    fetchRSVPCounts()
  }
}

onMounted(() => {
  fetchRSVPCounts()
  window.addEventListener('rsvp-updated', handleRsvpUpdate)
})

onUnmounted(() => {
  window.removeEventListener('rsvp-updated', handleRsvpUpdate)
})
</script>

<template>
  <div class="event-header">
    <!-- Title and actions row -->
    <Flex
      :x-between="!isBelowSmall"
      :x-center="isBelowSmall"
      :row="!isBelowSmall"
      :column-reverse="isBelowSmall"
      :y-start="!isBelowSmall"
      :y-center="isBelowSmall"
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
        />

        <!-- Time ago for past events -->
        <div v-else-if="!isUpcoming && !isOngoing && timeAgo" class="event-header__time-ago-compact">
          <span class="event-header__time-ago-text">{{ timeAgo }}</span>
        </div>

        <!-- Event date display -->
        <Flex
          y-center
          :x-center="isBelowSmall"
          :x-end="!isBelowSmall"
          class="event-header__date-display text-color-light"
        >
          <TimestampDate size="xxs" :date="props.event.date" class="event-header__date-time" format="dddd, MMMM D, YYYY [at] HH:mm" />
          <!-- Duration display -->
          <div v-if="props.event.duration_minutes" class="text-xxs event-header__duration">
            for {{ formatDurationFromMinutes(props.event.duration_minutes) }}
          </div>
        </Flex>
      </Flex>
    </Flex>

    <Divider size="1" />

    <!-- Event meta information -->
    <Flex gap="m" x-between expand :column="isBelowSmall">
      <Flex :gap="isBelowSmall ? 'xxs' : 's'" wrap class="event-header__badges-section" :x-center="isBelowSmall" :expand="isBelowSmall">
        <Badge v-if="props.event.location" variant="neutral" size="l">
          <Icon name="ph:map-pin-fill" />
          {{ props.event.location }}
        </Badge>

        <Tooltip v-if="props.event.note" placement="bottom">
          <template #tooltip>
            <div class="event-header__tooltip-content">
              {{ props.event.note }}
            </div>
          </template>
          <Badge variant="neutral" size="l" class="event-header__note-badge">
            <Icon name="ph:note" />
            Note
          </Badge>
        </Tooltip>

        <template v-if="!isOngoing">
          <Badge
            :variant="isOngoing ? 'success' : isUpcoming ? 'accent' : 'neutral'"
            size="l"
          >
            <Icon :name="isUpcoming ? 'ph:calendar-plus' : 'ph:calendar-x'" />
            {{ isUpcoming ? 'Upcoming' : 'Past Event' }}
          </Badge>
        </template>

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
  </div>
</template>

<style lang="scss">
@use '@/assets/breakpoints.scss' as *;

.event-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-l);

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

  &__date-display {
    gap: 0.5rem !important;
  }

  &__date-time {
    font-size: var(--font-size-m);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text);
  }

  &__duration {
    @media (max-width: $breakpoint-s) {
      font-size: var(--font-size-xxs);
    }
  }

  &__time-ago-compact {
    .event-header__time-ago-text {
      font-size: var(--font-size-xxl);
      font-weight: var(--font-weight-semibold);
    }
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
