<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Button, Divider, Flex, Tooltip } from '@dolanske/vui'
import EventGames from '@/components/Events/EventGames.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
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

const _props = defineProps<Props>()

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
  if (!_props.event?.id)
    return

  try {
    const { count: yesCount } = await supabase
      .from('events_rsvps')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', _props.event.id)
      .eq('rsvp', 'yes')

    const { count: tentativeCount } = await supabase
      .from('events_rsvps')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', _props.event.id)
      .eq('rsvp', 'tentative')

    const { count: noCount } = await supabase
      .from('events_rsvps')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', _props.event.id)
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
  if (customEvent.detail?.eventId === _props.event.id) {
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
    <Flex x-between align="start" gap="l" class="event-header__title-row">
      <Flex column class="event-header__title-section">
        <h1 class="event-header__title">
          {{ event.title }}
        </h1>
        <p v-if="event.description" class="event-header__description">
          {{ event.description }}
        </p>
        <!-- Games Section -->
        <template v-if="games && games.length > 0">
          <EventGames :games="games" :show-label="false" />
        </template>
      </Flex>

      <!-- Timing/Countdown Section -->
      <div class="event-header__timing-section">
        <!-- Enhanced Countdown for upcoming events or NOW for ongoing -->
        <CountdownTimer
          v-if="isUpcoming || isOngoing"
          :countdown="countdown"
          :is-ongoing="isOngoing"
        />

        <!-- Time ago for past events -->
        <div v-else-if="!isUpcoming && !isOngoing && timeAgo" class="event-header__time-ago-compact">
          <span class="event-header__time-ago-text">{{ timeAgo }}</span>
        </div>

        <!-- Event date display -->
        <Flex y-center class="event-header__date-display">
          <TimestampDate size="xs" :date="event.date" class="event-header__date-time" format="dddd, MMMM D, YYYY [at] HH:mm" />
          <!-- Duration display -->
          <div v-if="event.duration_minutes" class="event-header__duration">
            for {{ formatDurationFromMinutes(event.duration_minutes) }}
          </div>
        </Flex>
      </div>
    </Flex>

    <Divider :margin="0" size="xxs" />

    <!-- Event meta information -->
    <Flex gap="m" x-between expand>
      <Flex gap="m" wrap class="event-header__badges-section">
        <Badge v-if="event.location" variant="neutral" size="l">
          <Icon name="ph:map-pin-fill" />
          {{ event.location }}
        </Badge>

        <Tooltip v-if="event.note" placement="bottom">
          <template #tooltip>
            <div class="event-header__tooltip-content">
              {{ event.note }}
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
        <EventRSVPCount :event="event" variant="accent" size="l" :show-when-zero="false" />
      </Flex>

      <Flex gap="xs" class="event-header__actions">
        <!-- RSVP button -->
        <RSVPButton :event="event" size="s" />

        <!-- View RSVPs button -->
        <Button
          v-if="user"
          variant="accent"
          size="s"
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
          <Button size="s">
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

<style lang="scss" scoped>
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

    @media (max-width: $breakpoint-sm) {
      align-items: center;
      flex-direction: column-reverse !important;
      gap: var(--space-m);
    }
  }

  &__title-section {
    flex: 1;
  }

  &__title {
    font-size: var(--font-size-xxxl);
    font-weight: var(--font-weight-bold);
    margin: 0;
    line-height: 1.2;

    @media (max-width: $breakpoint-sm) {
      font-size: var(--font-size-xxl);
    }

    @media (max-width: $breakpoint-xs) {
      font-size: var(--font-size-xl);
    }
  }

  &__description {
    font-size: var(--font-size-l);
    color: var(--text-color-light);
    line-height: 1.5;

    @media (max-width: $breakpoint-sm) {
      font-size: var(--font-size-m);
    }
  }

  &__timing-section {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-s);
    min-width: fit-content;

    @media (max-width: $breakpoint-sm) {
      align-items: flex-start;
      width: 100%;
    }
  }

  &__date-display {
    text-align: right;
    gap: 0.5rem !important;

    @media (max-width: $breakpoint-sm) {
      text-align: left;
    }
  }

  &__date-time {
    font-size: var(--font-size-m);
    font-weight: var(--font-weight-semibold);
    color: var(--text-color);
  }

  &__duration {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);

    @media (max-width: $breakpoint-sm) {
      font-size: var(--font-size-s);
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
