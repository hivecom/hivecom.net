<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Skeleton } from '@dolanske/vui'
import { useIntervalFn } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

interface Props {
  event: Tables<'events'>
  size?: 's' | 'm' | 'l'
  showIcon?: boolean
  showWhenZero?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'l',
  variant: 'accent',
  showIcon: true,
  showWhenZero: false,
})

// RSVP count functionality
const supabase = useSupabaseClient()
const goingCount = ref<number>(0)
const loadingCount = ref(true)
const now = ref(new Date())

const eventStart = computed(() => props.event ? new Date(props.event.date) : null)
const eventEnd = computed(() => {
  if (!eventStart.value)
    return null

  if (props.event.duration_minutes) {
    return new Date(eventStart.value.getTime() + props.event.duration_minutes * 60 * 1000)
  }

  return eventStart.value
})

const hasEventEnded = computed(() => {
  if (!eventEnd.value)
    return false

  return now.value >= eventEnd.value
})

const badgeVariant = computed(() => {
  return hasEventEnded.value ? 'neutral' : 'accent'
})

useIntervalFn(() => {
  now.value = new Date()
}, 60_000, { immediate: true })

// Computed properties for display text
const displayText = computed(() => {
  if (goingCount.value === 0) {
    return hasEventEnded.value ? 'No one joined' : 'No one going yet'
  }
  else if (goingCount.value === 1) {
    return hasEventEnded.value ? '1 person joined' : '1 person going'
  }
  else {
    return hasEventEnded.value
      ? `${goingCount.value} people joined`
      : `${goingCount.value} people going`
  }
})

const shouldShow = computed(() => {
  return !loadingCount.value && (goingCount.value > 0 || props.showWhenZero)
})

// Fetch RSVP count
async function fetchRsvpCount() {
  loadingCount.value = true

  try {
    const { count, error } = await supabase
      .from('events_rsvps')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', props.event.id)
      .eq('rsvp', 'yes')

    if (error) {
      console.error('Error fetching RSVP count:', error)
      return
    }

    goingCount.value = count || 0
  }
  catch (error) {
    console.error('Error fetching RSVP count:', error)
  }
  finally {
    loadingCount.value = false
  }
}

// Listen for RSVP updates to refresh count
function handleRsvpUpdate(event: Event) {
  const customEvent = event as CustomEvent
  if (customEvent.detail?.eventId === props.event.id) {
    fetchRsvpCount()
  }
}

// Lifecycle
onMounted(() => {
  fetchRsvpCount()
  window.addEventListener('rsvp-updated', handleRsvpUpdate)
})

onUnmounted(() => {
  window.removeEventListener('rsvp-updated', handleRsvpUpdate)
})

// Watch for event changes
watch(() => props.event?.id, () => {
  fetchRsvpCount()
})
</script>

<template>
  <div class="event-rsvp-count">
    <!-- Loading skeleton -->
    <Skeleton
      v-if="loadingCount"
      height="2rem"
      width="6rem"
      style="border-radius: 1rem;"
    />

    <!-- RSVP count badge -->
    <Badge
      v-else-if="shouldShow"
      :variant="badgeVariant"
      :size="size"
    >
      <Icon v-if="showIcon" name="ph:users" />
      {{ displayText }}
    </Badge>
  </div>
</template>

<style lang="scss" scoped>
.event-rsvp-count {
  display: inline-block;
}
</style>
