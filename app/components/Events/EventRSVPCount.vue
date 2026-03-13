<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Skeleton } from '@dolanske/vui'
import { computed, onMounted, ref, watch } from 'vue'
import { useEventTiming } from '@/composables/useEventTiming'
import { useRsvpBus } from '@/composables/useRsvpBus'

interface Props {
  event: Tables<'events'>
  size?: 's' | 'm' | 'l'
  showIcon?: boolean
  showWhenZero?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'l',
  showIcon: true,
  showWhenZero: false,
})

// RSVP count functionality
const supabase = useSupabaseClient()
const goingCount = ref<number>(0)
const loadingCount = ref(true)

const { hasEventEnded } = useEventTiming(() => props.event)

const badgeVariant = computed(() => {
  return hasEventEnded.value ? 'neutral' : 'accent'
})

// Computed properties for display text
const displayText = computed(() => {
  if (goingCount.value === 0) {
    return hasEventEnded.value ? 'No one joined' : 'No one going yet'
  }
  else if (goingCount.value === 1) {
    return hasEventEnded.value ? '1 Attended' : '1 Going'
  }
  else {
    return hasEventEnded.value
      ? `${goingCount.value} Attended`
      : `${goingCount.value} Going`
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

const { onRsvpUpdated } = useRsvpBus()

// Subscribe at setup time so auto-cleanup via onUnmounted is registered correctly
onRsvpUpdated(({ eventId }) => {
  if (eventId === props.event.id) {
    fetchRsvpCount()
  }
})

// Lifecycle
onMounted(() => {
  fetchRsvpCount()
})

// Watch for event changes
watch(() => props.event?.id, () => {
  fetchRsvpCount()
})

// NOTE (@dolanske): Exposing the count is easier than extracting functionality
// out. Not the best practise, but given this is for a single use-cases, I think
// we can let it slide this time.
defineExpose({
  count: goingCount,
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
      <Icon v-if="showIcon" :class="{ ended: hasEventEnded }" name="ph:users" />

      {{ displayText }}
    </Badge>
  </div>
</template>

<style lang="scss" scoped>
.event-rsvp-count {
  display: inline-block;
}

.iconify {
  color: var(--color-accent);
}

.ended {
  color: var(--color-neutral);
}
</style>
