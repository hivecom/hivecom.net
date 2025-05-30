<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Badge, Button, Divider, Flex, Grid, Modal, Skeleton, Tooltip } from '@dolanske/vui'
import TimestampDate from '~/components/Shared/TimestampDate.vue'
import Metadata from '../Shared/Metadata.vue'

const props = defineProps<{
  data: Tables<'events'>
  index: number
  isPast?: boolean
}>()

const _emit = defineEmits<{
  open: []
}>()

const isModalOpen = ref(false)

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
    @click="isModalOpen = true"
  >
    <!-- Countdown for upcoming events -->
    <div v-if="!isPast" class="event-item-countdown-container">
      <Grid :columns="4" gap="l" class="event-item-countdown">
        <span class="text-bold text-xxxl">{{ countdown.days }}</span>
        <span class="text-bold text-xxxl">{{ countdown.hours }}</span>
        <span class="text-bold text-xxxl">{{ countdown.minutes }}</span>
        <span class="text-bold text-xxxl">{{ countdown.seconds }}</span>
      </Grid>
      <div class="event-date">
        <TimestampDate :date="props.data.date" format="dddd, MMM D, YYYY [at] HH:mm" />
      </div>
    </div>

    <!-- Time ago for past events -->
    <div v-else class="event-item-time-ago">
      <div class="time-ago-text">
        <span class="text-bold text-xxxl color-text-lighter">{{ timeAgo }}</span>
      </div>
      <div class="event-date">
        <TimestampDate :date="props.data.date" format="MMM D, YYYY" />
      </div>
    </div>

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
      <Flex gap="xs" align="center">
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
    <div class="event-item-details">
      <Tooltip v-if="props.data.note" :content="props.data.note" position="left">
        <Icon name="ph:caret-right" class="event-item-arrow" />
      </Tooltip>
      <Icon v-else name="ph:caret-right" class="event-item-arrow" />
    </div>
  </Flex>

  <Divider />

  <!-- Event Details Modal -->
  <Modal :open="isModalOpen" scrollable size="l" :card="{ separators: true }" @close="isModalOpen = false">
    <template #header>
      <div class="event-modal-header">
        <h3>Event Details</h3>
        <NuxtLink v-if="props.data.link" :to="props.data.link" target="_blank" rel="noopener noreferrer">
          <Button variant="accent" size="s">
            <template #start>
              <Icon name="ph:link" />
            </template>
            Link
          </Button>
        </NuxtLink>
      </div>
    </template>

    <div class="event-modal-content">
      <!-- Markdown Content -->
      <div v-if="props.data.markdown" class="event-markdown">
        <Suspense suspensible>
          <template #fallback>
            <div class="event-markdown-skeleton">
              <Skeleton height="1rem" width="100%" class="mb-s" />
              <Skeleton height="1rem" width="100%" class="mb-s" />
              <Skeleton height="1rem" width="60%" />
            </div>
          </template>
          <MDC :partial="true" class="event-markdown-content typeset" :value="props.data.markdown" />
        </Suspense>
      </div>

      <!-- No additional details message -->
      <div v-else class="event-no-details">
        <p class="color-text-lighter">
          No additional details available for this event.
        </p>
      </div>

      <!-- Event Metadata -->
      <Metadata
        :created-at="props.data.created_at"
        :created-by="props.data.created_by"
        :modified-at="props.data.modified_at"
        :modified-by="props.data.modified_by"
      />
    </div>

    <template #footer="{ close }">
      <Button @click="close">
        Close
      </Button>
    </template>
  </Modal>
</template>

<style lang="scss">
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
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
  }

  &-countdown {
    span {
      font-variant-numeric: tabular-nums;
    }
  }

  &-time-ago {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 296px;
    text-align: center;
    gap: var(--space-xs);

    .time-ago-text {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }

  &-details {
    display: flex;
    align-items: center;
    justify-content: center;
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

.event-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-m);
  width: 100%;
}

.event-modal-content {
  .event-modal-section {
    margin-bottom: var(--space-l);

    &:last-child {
      margin-bottom: 0;
    }
  }

  .event-modal-countdown {
    .countdown-grid {
      .countdown-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: var(--space-xxs);

        span:first-child {
          font-variant-numeric: tabular-nums;
          color: var(--color-accent);
        }
      }
    }
  }
}

.event-markdown-content {
  padding-bottom: var(--space-m);
}

.event-no-details {
  padding: var(--space-l);
  text-align: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-m);
  background: var(--color-bg-subtle);
  margin-bottom: var(--space-m);

  p {
    margin: 0;
    font-style: italic;
  }
}

.event-markdown-skeleton {
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-m);
  padding: var(--space-m);
}
</style>
