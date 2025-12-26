<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import dayjs from 'dayjs'
import { formatDate } from '@/lib/utils/date'
import { truncate } from '@/lib/utils/formatting'

const props = defineProps<{
  data: Tables<'events'>[]
}>()

type FormattedEvents = Array<Tables<'events'> & {
  ongoing: boolean
  upcoming: boolean
}>

const sortedData = computed<FormattedEvents>(() => {
  return props.data
    .map((event) => {
      const eventDate = dayjs(event.date)
      const now = dayjs()

      // Calculate event end time based on duration
      const eventEnd = event.duration_minutes
        ? eventDate.add(event.duration_minutes, 'minute')
        : eventDate

      return {
        ...event,
        ongoing: eventDate <= now && now <= eventEnd,
        upcoming: eventDate > now,
      }
    })
    .sort((a, b) => {
      const aOngoing = a.ongoing ? 0 : (a.upcoming ? 1 : 2)
      const bOngoing = b.ongoing ? 0 : (b.upcoming ? 1 : 2)

      if (aOngoing !== bOngoing)
        return aOngoing - bOngoing

      return dayjs(a.date).valueOf() - dayjs(b.date).valueOf()
    })
})
</script>

<template>
  <ul class="calendar-list">
    <li v-for="event in sortedData" :key="event.id">
      <NuxtLink
        :to="`/events/${event.id}`"
        class="calendar-list__list-item"
        :class="{
          'calendar-list__list-item--ongoing': event.ongoing,
          'calendar-list__list-item--upcoming': event.upcoming,
        }"
      >
        <div class="item-indicator" />
        <strong>{{ event.title }}</strong>
        <span>{{ formatDate(event.date) }}</span>
      </NuxtLink>
    </li>
  </ul>
</template>

<style lang="scss" scoped>
.calendar-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);

  &__list-item {
    display: flex;
    flex-wrap: nowrap;
    gap: var(--space-xs);
    align-items: center;
    text-decoration: none;
    background-color: var(--color-bg-medium);
    border-radius: var(--border-radius-s);
    font-size: var(--font-size-s);
    padding-inline: var(--space-xs);
    padding-block: 6px;
    color: var(--color-text-lighter);
    transition: var(--transition-fast);

    strong,
    span {
      font-size: inherit;
      color: inherit;
      line-height: 1.2em;
    }

    strong {
      flex: 1;
      font-weight: var(--font-weight-medium);
    }

    .item-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--color-border-strong);
    }

    &:hover {
      background-color: var(--color-button-gray-hover);
    }

    &--ongoing {
      background-color: var(--color-accent);
      color: var(--light-color-text);

      &:hover {
        background-color: var(--color-bg-accent-raised);
      }

      .item-indicator {
        background-color: var(--light-color-text);
      }
    }

    &--upcoming {
      background-color: var(--color-bg-raised);
      color: var(--color-text);

      .item-indicator {
        background-color: var(--color-accent);
      }
    }
  }
}

:root.light {
  .calendar-list__list-item--ongoing {
    background-color: var(--color-bg-accent-lowered);

    &:hover {
      background-color: var(--color-bg-accent-raised);
    }

    .item-indicator {
      background-color: var(--color-text);
    }
  }
}
</style>
