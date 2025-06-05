<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Badge, Card, Flex } from '@dolanske/vui'
import TimestampDate from '~/components/Shared/TimestampDate.vue'
import { formatDurationFromMinutes } from '~/utils/duration'

interface Props {
  event: Tables<'events'>
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  compact: false,
})

// Determine event status
const eventStatus = computed(() => {
  const now = new Date()
  const eventStart = new Date(props.event.date)
  const eventEnd = props.event.duration_minutes
    ? new Date(eventStart.getTime() + props.event.duration_minutes * 60 * 1000)
    : eventStart

  if (now < eventStart) {
    return { type: 'upcoming', label: 'UPCOMING', variant: 'accent' as const }
  }
  else if (now >= eventStart && now <= eventEnd) {
    return { type: 'ongoing', label: 'NOW', variant: 'success' as const }
  }
  else {
    return { type: 'past', label: 'Past', variant: 'neutral' as const }
  }
})

// Calculate countdown for upcoming events
const countdown = ref({
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
})

function updateCountdown() {
  if (eventStatus.value.type !== 'upcoming')
    return

  const now = new Date()
  const eventDate = new Date(props.event.date)
  const diff = eventDate.getTime() - now.getTime()

  if (diff <= 0) {
    countdown.value = { days: 0, hours: 0, minutes: 0, seconds: 0 }
    return
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  countdown.value = { days, hours, minutes, seconds }
}

// Update countdown every second for upcoming events
useIntervalFn(updateCountdown, 1000, { immediate: true })

// Handle card click
function handleClick() {
  navigateTo(`/events/${props.event.id}`)
}
</script>

<template>
  <Card
    class="event-card"
    :class="{
      'event-card--ongoing': eventStatus.type === 'ongoing',
      'event-card--past': eventStatus.type === 'past',
      'event-card--compact': compact,
    }"
    @click="handleClick"
  >
    <div class="event-card__content">
      <!-- Status indicator for ongoing events -->
      <div v-if="eventStatus.type === 'ongoing'" class="event-card__live-indicator">
        <div class="event-card__live-dot" />
        <span class="event-card__live-text">{{ eventStatus.label }}</span>
      </div>

      <!-- Status indicator for upcoming events -->
      <div v-if="eventStatus.type === 'upcoming'" class="event-card__upcoming-indicator">
        <span class="event-card__upcoming-text">{{ eventStatus.label }}</span>
      </div>

      <!-- Event header -->
      <div class="event-card__header">
        <h3 class="event-card__title">
          {{ event.title }}
          <Icon v-if="event.link" name="ph:arrow-square-out" class="event-card__external-icon" />
        </h3>

        <!-- Status badge for past events only -->
        <Badge
          v-if="eventStatus.type === 'past'"
          :variant="eventStatus.variant"
          size="s"
          class="event-card__status-badge"
        >
          {{ eventStatus.label }}
        </Badge>
      </div>

      <!-- Event timing -->
      <div class="event-card__timing">
        <Flex gap="xs" y-center class="event-card__date">
          <Icon name="ph:calendar" size="16" />
          <TimestampDate
            :date="event.date"
            :format="compact ? 'MMM D, YYYY' : 'dddd, MMM D, YYYY [at] HH:mm'"
          />
        </Flex>

        <!-- Duration -->
        <div v-if="event.duration_minutes" class="event-card__duration">
          <Icon name="ph:clock" size="16" />
          <span>{{ formatDurationFromMinutes(event.duration_minutes) }}</span>
        </div>
      </div>

      <!-- Countdown for upcoming events -->
      <div v-if="eventStatus.type === 'upcoming' && !compact" class="event-card__countdown">
        <div class="event-card__countdown-item">
          <span class="event-card__countdown-value">{{ countdown.days }}</span>
          <span class="event-card__countdown-label">Days</span>
        </div>
        <div class="event-card__countdown-item">
          <span class="event-card__countdown-value">{{ countdown.hours }}</span>
          <span class="event-card__countdown-label">Hours</span>
        </div>
        <div class="event-card__countdown-item">
          <span class="event-card__countdown-value">{{ countdown.minutes }}</span>
          <span class="event-card__countdown-label">Min</span>
        </div>
      </div>

      <!-- Event description -->
      <p v-if="event.description" class="event-card__description">
        {{ event.description }}
      </p>

      <!-- Event metadata -->
      <div v-if="event.location || event.note" class="event-card__meta">
        <Badge v-if="event.location" variant="neutral" size="s">
          <Icon name="ph:map-pin" />
          {{ event.location }}
        </Badge>
        <Badge v-if="event.note" variant="neutral" size="s">
          <Icon name="ph:note" />
          Note
        </Badge>
      </div>
    </div>

    <!-- Hover indicator -->
    <div class="event-card__hover-indicator">
      <Icon name="ph:arrow-right" />
    </div>
  </Card>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.event-card {
  position: relative;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);

    .event-card__hover-indicator {
      opacity: 1;
      transform: translateX(0);
    }
  }

  &--ongoing {
    border-color: var(--color-accent);
    background: linear-gradient(
      135deg,
      rgba(var(--color-accent-rgb), 0.05) 0%,
      rgba(var(--color-accent-rgb), 0.02) 50%,
      transparent 100%
    );

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(
        90deg,
        var(--color-accent) 0%,
        var(--color-accent-light) 50%,
        var(--color-accent) 100%
      );
      background-size: 200% 100%;
      animation: shimmer 2s linear infinite;
    }
  }

  &--past {
    opacity: 0.7;

    &:hover {
      opacity: 0.9;
    }
  }

  &--compact {
    .event-card__timing {
      margin-bottom: var(--space-s);
    }

    .event-card__description {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      margin-bottom: var(--space-s);
    }
  }

  &__content {
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  &__live-indicator {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin-bottom: var(--space-s);
    font-size: var(--font-size-s);
    font-weight: 600;
    color: var(--color-accent);
  }

  &__live-dot {
    width: 8px;
    height: 8px;
    background: var(--color-text-red);
    border-radius: 50%;
    animation: pulse 2s infinite;
  }

  &__live-text {
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  &__upcoming-indicator {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin-bottom: var(--space-s);
    font-size: var(--font-size-s);
    font-weight: 600;
    color: var(--color-text-green);
  }

  &__upcoming-text {
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-s);
    margin-bottom: var(--space-m);
  }

  &__title {
    font-size: var(--font-size-l);
    font-weight: 600;
    line-height: 1.3;
    margin: 0;
    color: var(--color-text);
    flex: 1;

    .event-card--ongoing & {
      color: var(--color-accent);
    }
  }

  &__external-icon {
    margin-left: var(--space-xs);
    opacity: 0.6;
    font-size: var(--font-size-s);
  }

  &__status-badge {
    flex-shrink: 0;
  }

  &__timing {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin-bottom: var(--space-m);
    font-size: var(--font-size-s);
    color: var(--color-text-light);
  }

  &__date,
  &__duration {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  &__countdown {
    display: flex;
    gap: var(--space-m);
    margin-bottom: var(--space-m);
    padding: var(--space-s);
    background: var(--color-bg-subtle);
    border-radius: var(--border-radius-s);
  }

  &__countdown-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  &__countdown-value {
    font-size: var(--font-size-l);
    font-weight: 700;
    color: var(--color-accent);
    line-height: 1;
  }

  &__countdown-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-light);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: var(--space-xxs);
  }

  &__description {
    font-size: var(--font-size-s);
    line-height: 1.5;
    color: var(--color-text-light);
    margin: 0 0 var(--space-m) 0;
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    margin-bottom: var(--space-s);
  }

  &__hover-indicator {
    position: absolute;
    top: var(--space-m);
    right: var(--space-m);
    opacity: 0;
    transform: translateX(-8px);
    transition: all 0.3s ease;
    color: var(--color-accent);
    font-size: var(--font-size-l);

    .event-card--ongoing & {
      color: var(--color-accent);
    }
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

// Mobile responsiveness
@media (max-width: $breakpoint-sm) {
  .event-card {
    &__countdown {
      gap: var(--space-s);
    }

    &__countdown-value {
      font-size: var(--font-size-m);
    }

    &__hover-indicator {
      display: none;
    }
  }
}
</style>
