<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Card, Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useBreakpoint } from '@/lib/mediaQuery'
import { truncate } from '@/lib/utils/formatting'
import EventRSVPCount from './EventRSVPCount.vue'

const props = defineProps<Props>()

dayjs.extend(relativeTime)

interface Props {
  event: Tables<'events'>
  compact?: boolean
}

// Determine event status
const eventStatus = computed(() => {
  const now = new Date()
  const eventStart = new Date(props.event.date)
  const eventEnd = props.event.duration_minutes
    ? new Date(eventStart.getTime() + props.event.duration_minutes * 60 * 1000)
    : eventStart

  if (now < eventStart) {
    return { type: 'upcoming', label: 'UPCOMING', variant: 'accent' }
  }
  else if (now >= eventStart && now <= eventEnd) {
    return { type: 'ongoing', label: 'NOW', variant: 'success' }
  }
  else {
    return { type: 'past', label: 'PAST', variant: 'neutral' }
  }
})

const countEl = useTemplateRef('countRef')
const count = computed(() => countEl.value?.count ?? 0)

const isBelowSmall = useBreakpoint('<m')
</script>

<template>
  <NuxtLink :to="`/events/${props.event.id}`">
    <Card
      class="event-card" :class="{
        past: eventStatus.type === 'past',
        ongoing: eventStatus.type === 'ongoing',
      }"
    >
      <Flex column gap="xs" expand class="h-100">
        <span
          class="event-card__status"
          :class="[eventStatus.type]"
        >
          {{ eventStatus.label }}
        </span>
        <strong class="event-card__title">
          {{ props.event.title }}
        </strong>
        <p class="event-card__description flex-1">
          {{ truncate(props.event.description, 108) }}
        </p>

        <Flex :gap="isBelowSmall ? 's' : 'l'" y-center wrap>
          <Flex y-center gap="xs" class="event-card__details">
            <Icon name="ph:calendar" size="18" />
            {{ dayjs(props.event.date).fromNow() }}
          </Flex>

          <Flex v-if="count" y-center gap="xs" class="event-card__details">
            <Icon name="ph:user" size="18" />
            {{ count }} attendee{{ count === 1 ? '' : 's' }}
          </Flex>
        </Flex>
      </Flex>
    </Card>
  </NuxtLink>

  <EventRSVPCount
    ref="countRef"
    style="display:none"
    :event="props.event"
    size="s"
    show-when-zero
  />
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.event-card {
  height: 100%;

  :deep(.vui-card-content) {
    height: 100% !important;
  }

  &:not(&.past) {
    background-color: var(--color-bg-card);

    &:hover {
      background-color: var(--color-bg-raised);
    }
  }

  &.past {
    opacity: 0.6;
  }

  &.ongoing {
    border-color: var(--color-bg-accent-lowered) !important;
  }

  &:hover {
    background-color: var(--color-bg-medium);
  }

  &__title {
    display: block;
    font-size: var(--font-size-l);
    line-height: var(--line-height-title);
  }

  &__description {
    display: block;
    width: 100%;
    font-size: var(--font-size-m);
    color: var(--color-text-lighter);
    flex: 1;
    margin-bottom: var(--space-xl);

    @media (max-width: $breakpoint-m) {
      margin-bottom: var(--space-m) !important;
    }
  }

  &__details {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
  }

  &__status {
    font-size: var(--font-size-s);
    margin-bottom: var(--space-s);
    text-transform: uppercase;
    color: var(--color-text-lighter);
    font-weight: var(--font-weight-bold);

    &.upcoming {
      color: var(--color-accent);
    }

    &.ongoing {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      color: var(--color-accent);

      &:before {
        content: '';
        display: inline-block;
        width: 8px;
        height: 8px;
        background-color: var(--color-text-red);
        border-radius: 999px;
        animation: shimmer 2s linear infinite;
      }
    }
  }
}
</style>
