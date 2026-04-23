<script setup lang="ts">
import type { useDataLinkPreview } from '@/composables/useDataLinkPreview'
import type { Tables } from '@/types/database.overrides'
import { Flex } from '@dolanske/vui'
import { useIntervalFn } from '@vueuse/core'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import CountdownTimer from '@/components/Events/CountdownTimer.vue'
import { useEventTiming } from '@/composables/useEventTiming'
import { useBreakpoint } from '@/lib/mediaQuery'

type LinkPreviewData = NonNullable<ReturnType<typeof useDataLinkPreview>['data']['value']>
type EventData = LinkPreviewData & { type: 'event' }

const props = defineProps<{
  data: EventData
}>()

dayjs.extend(relativeTime)

const isMobile = useBreakpoint('<s')

const now = ref(new Date())
useIntervalFn(() => {
  now.value = new Date()
}, 1_000, { immediate: true })

const eventStub = computed(() => {
  if (props.data.date == null)
    return null
  return {
    date: props.data.date,
    duration_minutes: props.data.durationMinutes,
    created_at: props.data.date,
  } as unknown as Tables<'events'>
})

const { isUpcoming: eventIsUpcoming, isOngoing: eventIsOngoing, countdown: eventCountdown } = useEventTiming(eventStub)

const eventStatus = computed(() => {
  if (eventIsOngoing.value)
    return 'ongoing' as const
  if (eventIsUpcoming.value)
    return 'upcoming' as const
  return 'past' as const
})

function formatDate(date: string | null): string {
  if (date == null || date === '')
    return 'Unknown date'
  return dayjs(date).format('MMM D, YYYY')
}
</script>

<template>
  <NuxtLink
    class="link-embed link-embed--event"
    :href="data.href"
  >
    <Flex :column="isMobile" :y-center="!isMobile" :x-between="!isMobile" gap="m" class="link-embed__body" :class="{ 'link-embed__body--event-mobile': isMobile }">
      <!-- Left: text content -->
      <Flex column gap="xs" class="link-embed__event-content">
        <Flex y-center gap="s" class="link-embed__header">
          <Icon name="ph:calendar" class="link-embed__icon" />
          <span class="link-embed__eyebrow">Event</span>
        </Flex>

        <Flex y-center gap="s">
          <span class="link-embed__title">{{ data.title }}</span>
        </Flex>

        <p v-if="data.description" class="link-embed__description">
          {{ data.description }}
        </p>

        <Flex y-center gap="s" class="link-embed__meta">
          <span class="link-embed__meta-item">{{ formatDate(data.date) }}</span>
          <template v-if="data.location">
            <span class="link-embed__meta-sep">&middot;</span>
            <span class="link-embed__meta-item">{{ data.location }}</span>
          </template>
        </Flex>
      </Flex>

      <!-- Right: countdown timer (only for upcoming/ongoing) -->
      <CountdownTimer
        v-if="eventStatus !== 'past' && data.date != null"
        :countdown="eventCountdown"
        :is-ongoing="eventIsOngoing"
        :created-at="data.date"
        simple
        class="link-embed__event-countdown"
      />
    </Flex>
  </NuxtLink>
</template>

<style scoped lang="scss">
.link-embed__event-content {
  flex: 1;
  min-width: 0;
}

.link-embed__event-countdown {
  width: auto;

  @media (max-width: 768px) {
    width: 100%;
  }
  background-color: var(--color-bg) !important;
}

.link-embed__body--event-mobile {
  .link-embed__event-content {
    width: 100%;
  }

  .link-embed__event-countdown {
    flex-shrink: unset;
    align-self: flex-start;
  }
}
</style>
