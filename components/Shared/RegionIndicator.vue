<script setup lang="ts">
/**
 * RegionIndicator component displays a region code with an appropriate flag emoji
 */

// Define props
const props = defineProps<{
  /**
   * Region code: 'eu' (Europe), 'na' (North America), 'all' (Multi-Region)
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
    case 'na': return '🇨🇦'
    case 'all': return '🌎'
    default: return ''
  }
})

const regionLabel = computed(() => {
  switch (props.region) {
    case 'eu': return 'Europe'
    case 'na': return 'North America'
    case 'all': return 'Multi-Region'
    default: return 'No Region'
  }
})
</script>

<template>
  <div class="region-indicator">
    <span v-if="props.region !== null" class="region-indicator__emoji text-m" :title="regionLabel">{{ regionEmoji }}</span>
    <span v-if="showLabel" class="region-indicator__label text-s">{{ regionLabel }}</span>
  </div>
</template>

<style lang="scss" scoped>
.region-indicator {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs, 0.25rem);
}
</style>
