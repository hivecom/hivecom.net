<script setup lang="ts">
import dayjs from 'dayjs'
import { useEvents } from '@/composables/useEvents'
import { formatDurationCompact } from '@/lib/utils/duration'

const { events } = useEvents()

const badge = ref<string | null>(null)

function computeBadge(now = dayjs()) {
  if (!events.value.length) {
    badge.value = null
    return
  }

  // Ongoing event -> NOW
  for (const event of events.value) {
    const start = dayjs(event.date)
    if (!start.isValid()) {
      continue
    }
    if (event.duration_minutes == null) {
      continue
    }

    const end = start.add(event.duration_minutes, 'minute')
    if (start.valueOf() <= now.valueOf() && now.valueOf() < end.valueOf()) {
      badge.value = 'NOW'
      return
    }
  }

  // Next upcoming event
  const nextStart = events.value
    .map(event => dayjs(event.date))
    .filter(date => date.isValid() && date.isAfter(now))
    .sort((a, b) => a.valueOf() - b.valueOf())[0]

  if (!nextStart) {
    badge.value = null
    return
  }

  const diffMs = nextStart.diff(now)
  if (diffMs >= 7 * 24 * 60 * 60 * 1000) {
    badge.value = null
    return
  }

  badge.value = formatDurationCompact(diffMs) || null
}

// Recompute badge whenever the events list populates or changes
watch(events, () => computeBadge(), { immediate: true })

let intervalId: number | null = null

onMounted(() => {
  intervalId = window.setInterval(() => {
    computeBadge()
  }, 1000)
})

onBeforeUnmount(() => {
  if (intervalId != null) {
    window.clearInterval(intervalId)
  }
})
</script>

<template>
  <SharedTinyBadge v-if="badge" :variant="badge === 'NOW' ? 'accent' : 'neutral'">
    {{ badge }}
  </SharedTinyBadge>
</template>
