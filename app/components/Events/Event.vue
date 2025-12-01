<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Divider, Flex, Grid, Tooltip } from '@dolanske/vui'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { formatDurationFromMinutes } from '@/lib/utils/duration'
import EventRSVPCount from './EventRSVPCount.vue'

const props = defineProps<{
  data: Tables<'events'>
  index: number
  isPast?: boolean
  isOngoing?: boolean
}>()

const _emit = defineEmits<{
  open: []
}>()

const countdown = ref({
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
})

const isCountdownComplete = computed(() =>
  countdown.value.days === 0
  && countdown.value.hours === 0
  && countdown.value.minutes === 0
  && countdown.value.seconds === 0,
)

function updateTime() {
  const now = new Date()
  const eventDate = new Date(props.data.date)
  const diff = eventDate.getTime() - now.getTime()

  if (diff <= 0) {
    countdown.value = {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    }

    return
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  countdown.value = {
    days,
    hours,
    minutes,
    seconds,
  }
}

// Calculate "time ago" for past events
const timeAgo = computed(() => {
  if (!props.isPast)
    return ''

  const now = new Date()
  const eventDate = new Date(props.data.date)
  const diff = now.getTime() - eventDate.getTime()

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (days > 0) {
    return days === 1 ? '1 day ago' : `${days} days ago`
  }
  else if (hours > 0) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  }
  else if (minutes > 0) {
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  }
  else {
    return 'Just now'
  }
})

useIntervalFn(updateTime, 1000, { immediate: true })
updateTime()
</script>

<template>
  <Flex
    gap="xxl"
    class="event-item event-item--clickable"
    :class="{
      'event-item--first': index === 0 && !isPast,
    }"
    y-center
    @click="navigateTo(`/events/${data.id}`)"
  >
    <!-- Countdown for upcoming events -->
    <Flex
      v-if="!isPast && !isOngoing && !isCountdownComplete"
      column
      gap="xs"
      class="event-item__countdown-container"
    >
      <Grid :columns="4" gap="l" class="event-item__countdown" expand>
        <Flex column gap="xxs" y-center x-center class="event-item__countdown-item">
          <span class="event-item__countdown-label text-xs text-color-lighter">Days</span>
          <span class="text-bold text-xxxl">{{ countdown.days }}</span>
        </Flex>
        <Flex column gap="xxs" y-center x-center class="event-item__countdown-item">
          <span class="event-item__countdown-label text-xs text-color-lighter">Hours</span>
          <span class="text-bold text-xxxl">{{ countdown.hours }}</span>
        </Flex>
        <Flex column gap="xxs" y-center x-center class="event-item__countdown-item">
          <span class="event-item__countdown-label text-xs text-color-lighter">Minutes</span>
          <span class="text-bold text-xxxl">{{ countdown.minutes }}</span>
        </Flex>
        <Flex column gap="xxs" y-center x-center class="event-item__countdown-item">
          <span class="event-item__countdown-label text-xs text-color-lighter">Seconds</span>
          <span class="text-bold text-xxxl">{{ countdown.seconds }}</span>
        </Flex>
      </Grid>
      <Flex x-center expand class="event-item__event-date">
        <TimestampDate :date="props.data.date" format="dddd, MMM D, YYYY [at] HH:mm" />
      </Flex>
      <Flex v-if="props.data.duration_minutes" x-center expand class="event-item__event-duration">
        <span class="text-xs text-color-lighter">Duration: {{ formatDurationFromMinutes(props.data.duration_minutes) }}</span>
      </Flex>
    </Flex>

    <!-- Ongoing event status -->
    <Flex
      v-else-if="isOngoing || (!isPast && isCountdownComplete)"
      column
      gap="xs"
      class="event-item__ongoing-container"
    >
      <Flex x-center class="event-item__ongoing-text" expand>
        <span class="text-bold text-xxxl color-accent">NOW</span>
      </Flex>
      <Flex x-center expand class="event-item__event-date">
        <TimestampDate :date="props.data.date" format="dddd, MMM D, YYYY [at] HH:mm" />
      </Flex>
      <Flex v-if="props.data.duration_minutes" x-center expand class="event-item__event-duration">
        <span class="text-xs text-color-lighter">Duration: {{ formatDurationFromMinutes(props.data.duration_minutes) }}</span>
      </Flex>
    </Flex>

    <!-- Time ago for past events -->
    <Flex v-else column gap="xs" class="event-item__time-ago">
      <Flex x-center class="event-item__time-ago-text" expand>
        <span class="text-bold text-xxxl text-color-lighter">{{ timeAgo }}</span>
      </Flex>
      <Flex x-center expand class="event-item__event-date">
        <TimestampDate :date="props.data.date" format="MMM D, YYYY" />
      </Flex>
      <Flex v-if="props.data.duration_minutes" x-center expand class="event-item__event-duration">
        <span class="text-xs text-color-lighter">Duration: {{ formatDurationFromMinutes(props.data.duration_minutes) }}</span>
      </Flex>
    </Flex>

    <Flex column gap="xs" expand class="event-item__details">
      <h5>
        <a
          v-if="props.data.link"
          :href="props.data.link"
          target="_blank"
          rel="noopener noreferrer"
          class="event-item__title-link"
          @click.stop
        >
          {{ props.data.title }}
          <Icon name="ph:arrow-square-out" class="ml-xs" size="14" />
        </a>
        <span v-else>{{ props.data.title }}</span>
      </h5>
      <p>
        {{ props.data.description }}
      </p>      <Flex gap="xs">
        <Badge v-if="props.data.location" variant="neutral">
          <Icon name="ph:map-pin-fill" />
          {{ props.data.location }}
        </Badge>
        <Tooltip v-if="props.data.note" placement="right">
          <template #tooltip>
            <div class="event-item__tooltip-content">
              {{ props.data.note }}
            </div>
          </template>
          <Badge variant="neutral" class="event-item__note-badge">
            <Icon name="ph:note" />
            Note
          </Badge>
        </Tooltip>

        <!-- RSVP Count Badge -->
        <EventRSVPCount
          :event="props.data"
          size="s"
          :show-when-zero="false"
        />
      </Flex>
    </Flex>

    <!-- Details indicator -->
    <Flex class="event-item__details-indicator">
      <Tooltip v-if="props.data.note" :content="props.data.note" position="left">
        <Icon name="ph:caret-right" class="event-item__arrow" />
      </Tooltip>
      <Icon v-else name="ph:caret-right" class="event-item__arrow" />
    </Flex>
  </Flex>

  <Divider />
</template>

<style lang="scss">
@use '@/assets/breakpoints.scss' as *;

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.event-item {
  margin-block: var(--space-l);
  padding-block: var(--space-l);
  border-radius: var(--border-radius-m);
  transition:
    background-color 0.2s ease,
    transform 0.2s ease;

  &--first {
    span {
      color: var(--color-accent);
    }
  }

  &--clickable {
    cursor: pointer;

    &:hover {
      background-color: var(--color-bg-raised);

      .event-item__arrow {
        color: var(--color-accent);

        @media screen and (max-width: $breakpoint-s) {
          transform: rotate(90deg);
        }
      }
    }

    // Mobile touch states
    @media (max-width: $breakpoint-s) {
      &:active {
        background-color: var(--color-bg-raised) !important;
        transform: scale(0.98) !important;
      }

      &:hover {
        transform: none !important;

        .event-item__arrow {
          transform: rotate(90deg) !important;
        }
      }
    }
  }

  &__countdown-container {
    min-width: 296px;
  }

  &__ongoing-container {
    min-width: 272px;
  }

  &__countdown {
    span {
      font-variant-numeric: tabular-nums;
    }
  }

  &__countdown-item {
    .event-item__countdown-label {
      display: none; // Hide labels on desktop
    }
  }

  &__time-ago {
    min-width: 296px;
    text-align: center;
  }

  &__ongoing-text {
    text-align: center;
    animation: pulse 2s infinite;
  }

  &__event-duration {
    margin-top: var(--space-xs);

    span {
      font-size: var(--font-size-xs);
      color: var(--color-text-lighter);
    }
  }

  &__details {
    padding: var(--space-s);
    padding-left: 0;

    @media screen and (max-width: $breakpoint-s) {
      align-items: center !important;
    }
  }

  &__arrow {
    font-size: 20px;
    color: var(--color-text-lighter);
    transition:
      transform 0.2s ease,
      color 0.2s ease;
  }

  &__event-date span {
    font-size: var(--font-size-xs) !important;
    color: var(--color-text-lighter) !important;
  }

  &__note-badge {
    cursor: help;
    transition: all 0.2s ease;

    // On mobile, make tooltips more accessible
    @media (max-width: $breakpoint-s) {
      cursor: pointer !important;

      &:active {
        background-color: var(--color-accent-muted) !important;
      }
    }
  }

  &__tooltip-content {
    max-width: 250px;
    font-size: var(--font-size-xs);
    line-height: 1.4;

    @media (max-width: $breakpoint-xs) {
      max-width: 200px !important;
      font-size: var(--font-size-xxs) !important;
    }
  }

  &__title-link {
    color: inherit;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    position: relative;
    z-index: 2;

    &:hover {
      color: var(--color-accent);
      text-decoration: underline;
    }
  }
}

@media (max-width: $breakpoint-s) {
  .event-item {
    flex-direction: column !important;
    gap: var(--space-m) !important;
    margin-block: var(--space-m) !important;
    padding: var(--space-m) !important;
    text-align: center !important;

    &__countdown-container,
    &__ongoing-container,
    &__time-ago {
      min-width: 100% !important;
      width: 100% !important;
      align-items: center !important;
    }

    &__countdown {
      width: 100%;
      justify-content: center !important;
      gap: var(--space-m) !important;

      span {
        text-align: center !important;
      }

      .event-item__countdown-item {
        .event-item__countdown-label {
          display: block !important; // Show labels on mobile
        }
      }
    }

    &__time-ago-text,
    &__ongoing-text {
      justify-content: center !important;

      span {
        text-align: center !important;
      }
    }

    &__event-date {
      justify-content: center !important;
      margin-top: var(--space-xs) !important;
      text-align: center !important;
    }

    .flex-1 {
      text-align: center !important;

      h5 {
        text-align: center !important;
      }

      p {
        text-align: center !important;
      }
    }

    // Center the badges container
    .vui-flex {
      justify-content: center !important;
    }

    &__details {
      align-self: center !important;
      padding: var(--space-xs) !important;
    }

    &__arrow {
      transform: rotate(90deg) !important;
    }

    &:hover .event-item__arrow {
      transform: rotate(90deg) !important;

      @media screen and (max-width: $breakpoint-s) {
        transform: rotate(90deg) !important;
      }
    }
  }
}

@media (max-width: $breakpoint-xs) {
  .event-item {
    padding: var(--space-s) !important;
    gap: var(--space-s) !important;
    text-align: center !important;

    &__countdown-container,
    &__ongoing-container,
    &__time-ago {
      min-width: 100% !important;
    }

    &__countdown {
      gap: var(--space-s) !important;
      justify-content: center !important;

      span {
        font-size: var(--font-size-xxl) !important;
        text-align: center !important;
      }

      .event-item__countdown-item {
        .event-item__countdown-label {
          display: block !important; // Show labels on mobile
          font-size: var(--font-size-xxs) !important;
        }
      }
    }

    &__time-ago-text,
    &__ongoing-text {
      justify-content: center !important;

      span {
        text-align: center !important;
      }
    }

    &__event-date {
      justify-content: center !important;
      text-align: center !important;

      span {
        text-align: center !important;
      }
    }

    .flex-1 {
      text-align: center !important;
    }

    h5 {
      margin-bottom: var(--space-xs) !important;
      text-align: center !important;
    }

    p {
      font-size: var(--font-size-s) !important;
      margin-bottom: var(--space-s) !important;
      text-align: center !important;
    }

    // Override VUI Badge component styles for mobile
    .vui-badge {
      font-size: var(--font-size-xxs) !important;
      padding: var(--space-xxs) var(--space-xs) !important;

      .vui-icon {
        width: 12px !important;
        height: 12px !important;
      }
    }

    // Override VUI Flex component gap for badges and center them
    .vui-flex {
      gap: var(--space-xxs) !important;
      justify-content: center !important;
    }
  }
}
</style>
