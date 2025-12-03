<script setup lang="ts">
import ProfileBadge from '@/components/Profile/Badges/ProfileBadge.vue'

const props = withDefaults(defineProps<{
  description?: string
  compact?: boolean
}>(), {
  description: 'Joined in the early days of the community',
  compact: false,
})
</script>

<template>
  <ProfileBadge
    label="Early Bird"
    :description="props.description"
    icon="ph:rocket-launch-bold"
    variant="gold"
    :compact="props.compact"
  />
</template>
