<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Button, Card, Flex } from '@dolanske/vui'
import EventHeader from '~/components/Events/EventHeader.vue'
import EventMarkdown from '~/components/Events/EventMarkdown.vue'
import EventMetadata from '~/components/Events/EventMetadata.vue'
import DetailStates from '~/components/Shared/DetailStates.vue'

// Get route parameter
const route = useRoute()
const eventId = Number.parseInt(route.params.id as string)

// Supabase client
const supabase = useSupabaseClient()

// Reactive data
const event = ref<Tables<'events'> | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

// Countdown for upcoming events
const countdown = ref<{
  days: number
  hours: number
  minutes: number
  seconds: number
} | null>(null)

// Check if event is upcoming
const isUpcoming = computed(() => {
  if (!event.value)
    return false
  const now = new Date()
  const eventStart = new Date(event.value.date)
  return eventStart > now
})

// Check if event is ongoing
const isOngoing = computed(() => {
  if (!event.value)
    return false
  const now = new Date()
  const eventStart = new Date(event.value.date)
  const eventEnd = event.value.duration_minutes
    ? new Date(eventStart.getTime() + event.value.duration_minutes * 60 * 1000)
    : eventStart

  return eventStart <= now && now <= eventEnd
})

// Calculate "time ago" for past events
const timeAgo = computed(() => {
  if (!event.value || isUpcoming.value || isOngoing.value)
    return ''

  const now = new Date()
  const eventDate = new Date(event.value.date)
  const eventEnd = event.value.duration_minutes
    ? new Date(eventDate.getTime() + event.value.duration_minutes * 60 * 1000)
    : eventDate
  const diff = now.getTime() - eventEnd.getTime()

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

// Update countdown
function updateTime() {
  if (!event.value || (!isUpcoming.value && !isOngoing.value))
    return

  const now = new Date()
  const eventDate = new Date(event.value.date)

  if (isOngoing.value) {
    // For ongoing events, set countdown to zeros (will display "NOW")
    countdown.value = {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    }
    return
  }

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

// Fetch event data
async function fetchEvent() {
  try {
    loading.value = true
    error.value = null

    const { data, error: fetchError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        error.value = 'Event not found'
      }
      else {
        error.value = fetchError.message
      }
      return
    }

    event.value = data
  }
  catch (err: any) {
    error.value = err.message || 'An error occurred while loading the event'
  }
  finally {
    loading.value = false
  }
}

// Set up interval for countdown updates
useIntervalFn(updateTime, 1000, { immediate: true })

// Fetch data on mount
onMounted(() => {
  fetchEvent()
})

// SEO and page metadata
useSeoMeta({
  title: computed(() => event.value ? `${event.value.title} | Events` : 'Event Details'),
  description: computed(() => event.value?.description || 'Event details'),
  ogTitle: computed(() => event.value ? `${event.value.title} | Events` : 'Event Details'),
  ogDescription: computed(() => event.value?.description || 'Event details'),
})

// Page title
useHead({
  title: computed(() => event.value ? event.value.title : 'Event Details'),
})
</script>

<template>
  <div class="page">
    <!-- Loading and Error States -->
    <DetailStates
      :loading="loading"
      :error="error"
      back-to="/events"
      back-label="Back to Events"
    >
      <template #error-message>
        We are unable to load event details at this time. Please try again later.
      </template>
    </DetailStates>

    <!-- Event Content -->
    <div v-if="event && !loading && !error" class="event-detail">
      <!-- Back Button -->
      <Flex x-between>
        <Button
          variant="gray"
          size="s"
          aria-label="Go back to Events page"
          class="event-detail__back-link"
          @click="$router.push('/events')"
        >
          <template #start>
            <Icon name="ph:arrow-left" />
          </template>
          Back to Events
        </Button>
      </Flex>

      <!-- Header -->
      <Card :class="{ 'event-ongoing': isOngoing }">
        <EventHeader
          :event="event"
          :is-upcoming="isUpcoming"
          :is-ongoing="isOngoing"
          :countdown="countdown"
          :time-ago="timeAgo"
        />
      </Card>

      <!-- Markdown -->
      <EventMarkdown :event="event" />

      <!-- Metadata -->
      <EventMetadata :event="event" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.event-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-l);

  &__back-link {
    text-decoration: none;
  }
}
</style>
