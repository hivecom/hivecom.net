<script setup lang="ts">
/**
 * RegionIndicator component displays a region code with an appropriate flag emoji
 */

// Define props
const props = defineProps<{
  /**
   * Region code: 'eu' (Europe), 'na' (North America), 'all' (All Regions)
   */
  region: 'eu' | 'na' | 'all' | null | undefined

  /**
   * Optional - Show text label alongside flag
   */
  showLabel?: boolean
}>()

// Computed properties to determine emoji and label
const regionEmoji = computed(() => {
  switch (props.region) {
    case 'eu': return '🇪🇺'
    case 'na': return '🇺🇸'
    case 'all': return '🌎'
    default: return '❓'
  }
})

const regionLabel = computed(() => {
  switch (props.region) {
    case 'eu': return 'Europe'
    case 'na': return 'North America'
    case 'all': return 'All Regions'
    default: return 'Unknown'
  }
})
</script>

<template>
  <div class="region-indicator">
    <span class="region-emoji" :title="regionLabel">{{ regionEmoji }}</span>
    <span v-if="showLabel" class="region-label">{{ regionLabel }}</span>
  </div>
</template>

<style scoped>
.region-indicator {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs, 0.25rem);
}

.region-emoji {
  font-size: 1.2em;
}

.region-label {
  font-size: 0.9em;
}
</style>
