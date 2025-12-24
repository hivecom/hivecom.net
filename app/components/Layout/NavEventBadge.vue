<script setup lang="ts">
import dayjs from 'dayjs'
import { formatDurationCompact } from '@/lib/utils/duration'

interface NavEvent {
  date: string
  duration_minutes: number | null
}

const supabase = useSupabaseClient()

const events = ref<NavEvent[]>([])
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

async function loadEvents() {
  const { data } = await supabase
    .from('events')
    .select('date, duration_minutes')
    .order('date', { ascending: false })
    .limit(25)

  events.value = (data ?? []) as NavEvent[]
  computeBadge()
}

let intervalId: number | null = null

onMounted(async () => {
  await loadEvents()

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
