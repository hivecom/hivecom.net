<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Grid } from '@dolanske/vui'
import { computed, onMounted, ref } from 'vue'

import KPICard from '../KPICard.vue'

type Event = Tables<'events'>

// Props
const props = defineProps<{
  refreshSignal?: number
}>()

// State
const supabase = useSupabaseClient()
const loading = ref(true)
const events = ref<Event[]>([])

// Computed KPIs
const totalEvents = computed(() => events.value.length)

const upcomingEvents = computed(() => {
  const now = new Date()
  return events.value.filter((event) => {
    const eventStart = new Date(event.date)
    return eventStart > now
  }).length
})

const pastEvents = computed(() => {
  const now = new Date()
  return events.value.filter((event) => {
    const eventStart = new Date(event.date)
    const eventEnd = event.duration_minutes
      ? new Date(eventStart.getTime() + event.duration_minutes * 60 * 1000)
      : eventStart

    return eventEnd < now
  }).length
})

const eventsThisMonth = computed(() => {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  return events.value.filter((event) => {
    const eventDate = new Date(event.date)
    return eventDate >= startOfMonth && eventDate <= endOfMonth
  }).length
})

// Fetch events data
async function fetchEvents() {
  loading.value = true

  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')

    if (error)
      throw error

    events.value = data || []
  }
  catch (error) {
    console.error('Error fetching events for KPIs:', error)
  }
  finally {
    loading.value = false
  }
}

// Watch for refresh signal from parent
watch(() => props.refreshSignal, () => {
  if (props.refreshSignal) {
    fetchEvents()
  }
}, { immediate: false })

// Initial fetch
onMounted(fetchEvents)
</script>

<template>
  <Grid :columns="4" gap="m" class="kpi-container" expand>
    <KPICard
      label="Total Events"
      :value="totalEvents"
      icon="ph:calendar"
      :is-loading="loading"
      variant="gray"
    />

    <KPICard
      label="Upcoming Events"
      :value="upcomingEvents"
      icon="ph:clock"
      :is-loading="loading"
      variant="primary"
    />

    <KPICard
      label="This Month"
      :value="eventsThisMonth"
      icon="ph:calendar-check"
      :is-loading="loading"
    />

    <KPICard
      label="Past Events"
      :value="pastEvents"
      icon="ph:check-circle"
      :is-loading="loading"
      variant="warning"
    />
  </Grid>
</template>
