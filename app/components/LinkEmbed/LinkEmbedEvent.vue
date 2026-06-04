<script setup lang="ts">
import type { useDataLinkPreview } from '@/composables/useDataLinkPreview'
import type { Tables } from '@/types/database.overrides'
import { Badge, Button, Flex } from '@dolanske/vui'
import { useIntervalFn } from '@vueuse/core'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { resolveComponent } from 'vue'
import CountdownTimer from '@/components/Events/CountdownTimer.vue'
import { useContainerBreakpoint } from '@/composables/useContainerBreakpoint'
import { useEventTiming } from '@/composables/useEventTiming'
import { humanizeRrule, nextOccurrenceDate } from '@/lib/utils/rrule'

type LinkPreviewData = NonNullable<ReturnType<typeof useDataLinkPreview>['data']['value']>
type EventData = LinkPreviewData & { type: 'event' }

const props = defineProps<{
  data: EventData
}>()

dayjs.extend(relativeTime)

const NuxtLink = resolveComponent('NuxtLink')
const el = ref<HTMLElement | null>(null)
// CountdownTimer has min-width: 380px at wide viewports; side-by-side needs
// ~600px to avoid squishing the text column beside it.
const isMobile = useContainerBreakpoint(el, 600)

const now = ref(new Date())
useIntervalFn(() => {
  now.value = new Date()
}, 1_000, { immediate: true })

// For recurring events, find the current or next occurrence so the countdown
// targets the right date rather than the (possibly past) series origin.
const effectiveDate = computed<string | null>(() => {
  if (props.data.date == null)
    return null
  if (!props.data.recurrenceRule)
    return props.data.date

  // Search from (now - duration) so an in-progress occurrence is still found.
  const durationMs = (props.data.durationMinutes ?? 0) * 60 * 1000
  const searchFrom = new Date(now.value.getTime() - durationMs)

  const stub = {
    date: props.data.date,
    recurrence_rule: props.data.recurrenceRule,
    duration_minutes: props.data.durationMinutes,
  } as unknown as Tables<'events'>

  const next = nextOccurrenceDate(stub, searchFrom)
  return next ? next.toISOString() : null
})

const eventStub = computed(() => {
  if (effectiveDate.value == null)
    return null
  return {
    date: effectiveDate.value,
    duration_minutes: props.data.durationMinutes,
    created_at: effectiveDate.value,
    recurrence_rule: props.data.recurrenceRule ?? null,
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
  <component
    :is="data.requiresAuth ? 'div' : NuxtLink"
    ref="el"
    class="link-embed link-embed--event"
    v-bind="data.requiresAuth ? {} : { href: data.href }"
  >
    <Flex :column="isMobile" :y-center="!isMobile" :x-between="!isMobile" gap="m" class="link-embed__body" :class="{ 'link-embed__body--event-mobile': isMobile }">
      <!-- Left: text content -->
      <Flex column gap="xs" class="link-embed__event-content">
        <Flex y-center gap="s" class="link-embed__header">
          <Icon name="ph:calendar" class="link-embed__icon" />
          <span class="link-embed__eyebrow">Event</span>
        </Flex>

        <!-- Auth-gated: sign-in nudge -->
        <template v-if="data.requiresAuth">
          <Flex y-center x-between expand gap="s" class="link-embed__signin-nudge">
            <span class="link-embed__signin-nudge-text">Sign in to view this event</span>
            <NuxtLink href="/auth/sign-in" class="link-embed__signin-btn" @click.stop>
              <Button variant="gray" size="s">
                Sign in
              </Button>
            </NuxtLink>
          </Flex>
        </template>

        <!-- Full event content -->
        <template v-else>
          <Flex y-center gap="s">
            <span class="link-embed__title">{{ data.title }}</span>
          </Flex>

          <p v-if="data.description" class="link-embed__description">
            {{ data.description }}
          </p>

          <Flex y-center gap="s" class="link-embed__meta">
            <span class="link-embed__meta-item">{{ formatDate(effectiveDate ?? data.date) }}</span>
            <template v-if="data.location">
              <span class="link-embed__meta-sep">-</span>
              <span class="link-embed__meta-item">{{ data.location }}</span>
            </template>
            <Badge v-if="data.recurrenceRule" variant="neutral" size="s">
              <template #start>
                <Icon name="ph:arrows-clockwise" size="12" />
              </template>
              {{ humanizeRrule(data.recurrenceRule) }}
            </Badge>
          </Flex>
        </template>
      </Flex>

      <!-- Right: countdown timer (only for upcoming/ongoing, not auth-gated) -->
      <CountdownTimer
        v-if="!data.requiresAuth && eventStatus !== 'past' && data.date != null"
        :countdown="eventCountdown"
        :is-ongoing="eventIsOngoing"
        :created-at="data.date"
        simple
        :compact="isMobile"
        class="link-embed__event-countdown"
      />
    </Flex>
  </component>
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

.link-embed__signin-nudge {
  width: 100%;
}

.link-embed__signin-nudge-text {
  font-size: var(--font-size-xs);
  color: var(--color-text-lighter);
}

.link-embed__signin-btn {
  text-decoration: none;
  flex-shrink: 0;
}
</style>
