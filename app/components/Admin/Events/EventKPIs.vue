<script setup lang="ts">
import { computed } from 'vue'
import { useEvents } from '@/composables/useEvents'
import KPICard from '../KPICard.vue'
import KPIContainer from '../KPIContainer.vue'

const { events, loading } = useEvents()

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
</script>

<template>
  <KPIContainer>
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
  </KPIContainer>
</template>
