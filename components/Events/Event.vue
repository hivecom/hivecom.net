<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Badge, Divider, Flex, Grid, Tooltip } from '@dolanske/vui'
import TimestampDate from '~/components/Shared/TimestampDate.vue'

const props = defineProps<{
  data: Tables<'events'>
  index: number
  isPast?: boolean
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
    class="event-item event-item-clickable"
    :class="{
      'event-item-first': index === 0 && !isPast,
    }"
    @click="navigateTo(`/events/${data.id}`)"
  >
    <!-- Countdown for upcoming events -->
    <Flex v-if="!isPast" column gap="xs" class="event-item-countdown-container">
      <Grid :columns="4" gap="l" class="event-item-countdown">
        <span class="text-bold text-xxxl">{{ countdown.days }}</span>
        <span class="text-bold text-xxxl">{{ countdown.hours }}</span>
        <span class="text-bold text-xxxl">{{ countdown.minutes }}</span>
        <span class="text-bold text-xxxl">{{ countdown.seconds }}</span>
      </Grid>
      <Flex x-center expand class="event-date">
        <TimestampDate :date="props.data.date" format="dddd, MMM D, YYYY [at] HH:mm" />
      </Flex>
    </Flex>

    <!-- Time ago for past events -->
    <Flex v-else column gap="xs" class="event-item-time-ago">
      <Flex x-center class="time-ago-text" expand>
        <span class="text-bold text-xxxl color-text-lighter">{{ timeAgo }}</span>
      </Flex>
      <Flex x-center expand class="event-date">
        <TimestampDate :date="props.data.date" format="MMM D, YYYY" />
      </Flex>
    </Flex>

    <div class="flex-1">
      <h5 class="mb-xs">
        <a
          v-if="props.data.link"
          :href="props.data.link"
          target="_blank"
          rel="noopener noreferrer"
          class="event-title-link"
          @click.stop
        >
          {{ props.data.title }}
          <Icon name="ph:arrow-square-out" class="ml-xs" size="14" />
        </a>
        <span v-else>{{ props.data.title }}</span>
      </h5>
      <p class="mb-m">
        {{ props.data.description }}
      </p>
      <Flex gap="xs">
        <Badge v-if="props.data.location" variant="accent">
          <Icon name="ph:map-pin-fill" />
          {{ props.data.location }}
        </Badge>
        <Tooltip v-if="props.data.note" placement="right">
          <template #tooltip>
            <div class="tooltip-content">
              {{ props.data.note }}
            </div>
          </template>
          <Badge variant="neutral" class="note-badge">
            <Icon name="ph:note" />
            Note
          </Badge>
        </Tooltip>
      </Flex>
    </div>

    <!-- Details indicator -->
    <Flex class="event-item-details">
      <Tooltip v-if="props.data.note" :content="props.data.note" position="left">
        <Icon name="ph:caret-right" class="event-item-arrow" />
      </Tooltip>
      <Icon v-else name="ph:caret-right" class="event-item-arrow" />
    </Flex>
  </Flex>

  <Divider />
</template>

<style lang="scss">
@use '@/assets/breakpoints.scss' as *;

.event-item {
  margin-block: var(--space-l);
  padding-block: var(--space-l);
  border-radius: var(--border-radius-m);
  transition:
    background-color 0.2s ease,
    transform 0.2s ease;

  &-first {
    span {
      color: var(--color-accent);
    }
  }

  &-clickable {
    cursor: pointer;

    &:hover {
      background-color: var(--color-bg-raised);
      transform: translateY(-2px);

      .event-item-arrow {
        transform: translateX(4px);
        color: var(--color-accent);
      }
    }
  }

  &-countdown-container {
    min-width: 296px;
  }

  &-countdown {
    span {
      font-variant-numeric: tabular-nums;
    }
  }

  &-time-ago {
    min-width: 296px;
    text-align: center;
  }

  &-details {
    padding: var(--space-s);
  }

  &-arrow {
    font-size: 20px;
    color: var(--color-text-lighter);
    transition:
      transform 0.2s ease,
      color 0.2s ease;
  }

  .event-date span {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
  }

  .note-badge {
    cursor: help;
    transition: all 0.2s ease;
  }

  .tooltip-content {
    max-width: 250px;
    font-size: var(--font-size-xs);
    line-height: 1.4;
  }
}

.event-title-link {
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

// Mobile responsiveness
@media (max-width: $breakpoint-sm) {
  .event-item {
    &-countdown-container,
    &-time-ago {
      min-width: 200px;
    }
  }
}

@media (max-width: $breakpoint-xs) {
  .event-item {
    &-countdown-container,
    &-time-ago {
      min-width: 150px;
    }

    .event-date span {
      font-size: var(--font-size-xxs);
    }
  }
}
</style>
