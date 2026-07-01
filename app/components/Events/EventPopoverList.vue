<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Flex } from '@dolanske/vui'
import { formatTime } from '@/lib/utils/date'

interface Props {
  events: Tables<'events'>[]
  emptyMessage?: string
}

const props = withDefaults(defineProps<Props>(), {
  emptyMessage: 'No ongoing events',
})

function formatEventTime(event: Tables<'events'>): string {
  return formatTime(event.date)
}

function formatEventDuration(event: Tables<'events'>): string {
  if (!event.duration_minutes)
    return ''
  const hours = Math.floor(event.duration_minutes / 60)
  const minutes = event.duration_minutes % 60
  if (hours === 0)
    return `${minutes}m`
  if (minutes === 0)
    return `${hours}h`
  return `${hours}h ${minutes}m`
}
</script>

<template>
  <div class="event-popover">
    <div v-if="props.events.length === 0" class="event-popover__empty">
      {{ props.emptyMessage }}
    </div>
    <div v-else class="event-popover__content">
      <div class="event-popover__count">
        <Icon name="ph:calendar-check" size="16" class="event-popover__icon" />
        {{ props.events.length }} event{{ props.events.length > 1 ? 's' : '' }}
      </div>
      <ul class="event-popover__list">
        <NuxtLink
          v-for="event in props.events"
          :key="event.id"
          :to="`/events/${event.id}`"
        >
          <li class="event-popover__item">
            <div class="event-popover__item-header">
              <div class="event-popover__title">
                {{ event.title }}
              </div>
              <div class="event-popover__time">
                {{ formatEventTime(event) }}
              </div>
            </div>
            <Flex y-center>
              <div v-if="event.location" class="event-popover__location">
                <Icon name="ph:map-pin" size="12" />
                {{ event.location }}
              </div>
              <div v-if="event.duration_minutes" class="event-popover__duration">
                <Icon name="ph:clock" size="12" />
                {{ formatEventDuration(event) }}
              </div>
            </Flex>
            <div class="event-popover__action">
              <Icon name="ph:arrow-right" size="12" />
              View event
            </div>
          </li>
        </NuxtLink>
      </ul>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.event-popover {
  padding: 0;
  min-width: 288px;
  max-width: 340px;
  overflow: hidden;

  &__header {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text);
    font-size: var(--font-size-s);
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    text-align: left;
  }

  &__icon {
    color: var(--color-accent);
  }

  &__content {
    padding: var(--space-s);
    background: var(--color-bg);
  }

  &__count {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    margin-bottom: var(--space-s);
    font-weight: var(--font-weight-medium);
  }

  &__empty {
    padding: var(--space-l);
    text-align: center;
    color: var(--color-text-lighter);
    font-size: var(--font-size-s);
    font-style: italic;
  }

  &__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  &__item {
    padding: var(--space-s);
    cursor: pointer;
    border-radius: var(--border-radius-s);
    transition: all 0.15s ease;
    background: var(--color-bg-medium);
    border: 1px solid var(--color-border);

    &:hover {
      background-color: var(--color-bg-raised);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }

    &:last-child {
      margin-bottom: 0;
    }
  }

  &__item-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-xs);
    gap: var(--space-s);
  }

  &__title {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text);
    font-size: var(--font-size-s);
    line-height: 1.3;
    flex: 1;
    text-align: left;
  }

  &__time {
    color: var(--color-accent);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    white-space: nowrap;
    background: var(--color-accent-muted);
    padding: 2px 6px;
    border-radius: var(--border-radius-xs);
  }

  &__location,
  &__duration {
    color: var(--color-text-lighter);
    font-size: var(--font-size-xs);
    display: flex;
    align-items: center;
    gap: var(--space-xxs);
    margin-bottom: var(--space-xxs);
    line-height: 1.3;
  }

  &__rsvp {
    margin-bottom: var(--space-xxs);

    .vui-badge {
      font-size: var(--font-size-xxs);
      padding: 2px 6px;
    }
  }

  &__action {
    color: var(--color-accent);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    display: flex;
    align-items: center;
    gap: var(--space-xxs);
    margin-top: var(--space-xs);
    opacity: 0.7;
    transition: opacity 0.15s ease;
  }

  &__item:hover &__action {
    opacity: 1;
  }
}

@media (max-width: $breakpoint-s) {
  .event-popover {
    min-width: 280px;
    max-width: 300px;

    &__header {
      padding: var(--space-s) var(--space-s) var(--space-xs);
      font-size: var(--font-size-xs);
    }

    &__content {
      padding: var(--space-xs) var(--space-s) var(--space-s);
    }

    &__count {
      font-size: var(--font-size-xxs);
    }

    &__title {
      font-size: var(--font-size-xs);
    }

    &__time {
      font-size: var(--font-size-xxs);
      padding: 1px 4px;
    }

    &__location,
    &__duration {
      font-size: var(--font-size-xxs);
    }

    &__rsvp {
      .vui-badge {
        font-size: var(--font-size-xxs);
        padding: 1px 4px;
      }
    }

    &__action {
      font-size: var(--font-size-xxs);
    }

    &__item {
      padding: var(--space-xs);
    }
  }
}
</style>
