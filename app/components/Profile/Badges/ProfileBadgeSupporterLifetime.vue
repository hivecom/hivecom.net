<script setup lang="ts">
import ProfileBadge from '@/components/Profile/Badges/ProfileBadge.vue'

const props = withDefaults(defineProps<{
  description?: string
  compact?: boolean
}>(), {
  description: 'Contributed to the community in a significant way',
  compact: false,
})
</script>

<template>
  <ProfileBadge
    label="Lifetime Supporter"
    :description="props.description"
    icon="ph:infinity-bold"
    variant="gold"
    :compact="props.compact"
  />
</template>
