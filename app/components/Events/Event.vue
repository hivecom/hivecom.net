<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Button, Card, Flex, Tooltip } from '@dolanske/vui'
// import { useBreakpoint } from '@/lib/mediaQuery'
import CountdownTimer from './CountdownTimer.vue'
import EventRSVPCount from './EventRSVPCount.vue'

const props = defineProps<{
  data: Tables<'events'>
  isOngoing?: boolean
  isHighlight: boolean
}>()

// TODO: mobile layout

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

// const isBelowSmall = useBreakpoint('<s')

useIntervalFn(updateTime, 1000, { immediate: true })
updateTime()
</script>

<template>
  <NuxtLink :to="`/events/${data.id}`">
    <Card class="event-item" :class="{ 'event-item--first': props.isHighlight }">
      <div class="event-item__container">
        <div>
          <Flex class="mb-xs" y-center>
            <h3>{{ props.data.title }}</h3>
            <Button
              v-if="props.data.link"
              square
              outline
              plain
              :size="props.isHighlight ? 'm' : 's'"
              target="_blank"
              rel="noopener noreferrer"
              :href="props.data.link"
              data-title-top="Visit website"
            >
              <span class="visually-hidden">
                Visit Event Link
              </span>
              <Icon name="ph:arrow-square-out" size="14" />
            </Button>
          </Flex>
          <p class="mb-m text-color-light">
            {{ props.data.description }}
          </p>
          <Flex>
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
            <EventRSVPCount
              :event="props.data"
              size="s"
              :show-when-zero="false"
            />
          </Flex>
        </div>
        <div class="event-item__countdown-wrap">
          <CountdownTimer
            :countdown
            :is-ongoing="props.isOngoing ?? false"
            :created-at="props.data.created_at"
            :simple="!props.isHighlight"
          />
        </div>
      </div>
    </Card>
  </NuxtLink>
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
  // margin-block: var(--space-m);
  border-radius: var(--border-radius-m);

  transition:
    background-color 0.2s ease,
    transform 0.2s ease;

  .vui-card-content {
    padding: var(--space-l);
  }

  &:hover {
    background-color: var(--color-bg-raised);
  }

  h3 {
    font-size: var(--font-size-xl);
  }

  &__container {
    display: grid;
    grid-template-columns: 1fr 420px;
    gap: var(--space-xxl);
    align-items: center;
  }

  &--first {
    background-color: var(--color-bg-raised);
    padding: var(--space-l);

    h3 {
      font-size: var(--font-size-xxxl);
    }

    p {
      font-size: var(--font-size-l);
    }

    span {
      color: var(--color-accent);
    }

    &:hover {
      background-color: var(--color-border);
    }
  }

  &__countdown-wrap {
    border: 1px solid var(--color-border-strong);
    border-radius: var(--border-radius-m);
    height: fit-content;
    width: 420px;

    .countdown-timer {
      background-color: var(--color-border-weak);
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

@media (max-width: $breakpoint-m) {
  .event-item {
    flex-direction: column !important;
    gap: var(--space-m) !important;
    margin-block: var(--space-m) !important;
    padding: var(--space-m) !important;
    text-align: center !important;

    .flex-1 {
      text-align: center !important;

      h3 {
        text-align: center !important;
      }

      p {
        text-align: center !important;
      }
    }

    &__container {
      display: flex;
      flex-direction: column;
      gap: var(--space-l);
    }

    &__countdown-wrap {
      width: fit-content;
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

    h3 {
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
      // gap: var(--space-xxs) !important;
      justify-content: center !important;
    }
  }
}
</style>
