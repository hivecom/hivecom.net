<script setup lang="ts">
import ProfileBadge from '@/components/Profile/Badges/ProfileBadge.vue'

const props = withDefaults(defineProps<{
  description?: string
  compact?: boolean
}>(), {
  description: 'Monthly Patreon supporter of the community',
  compact: false,
})
</script>

<template>
  <ProfileBadge
    label="Supporter"
    :description="props.description"
    icon="ph:heart-bold"
    variant="gold"
    :compact="props.compact"
  />
</template>
