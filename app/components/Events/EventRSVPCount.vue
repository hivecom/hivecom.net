<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Skeleton } from '@dolanske/vui'
import { computed } from 'vue'
import { useDataRsvpCount } from '@/composables/useDataRsvpCount'
import { useEventTiming } from '@/composables/useEventTiming'

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

const { hasEventEnded } = useEventTiming(() => props.event)
const { goingCount, loading: loadingCount } = useDataRsvpCount(() => props.event.id)

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
