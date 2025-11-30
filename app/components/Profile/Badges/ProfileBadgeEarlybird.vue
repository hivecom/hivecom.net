<script setup lang="ts">
import ProfileBadge from '@/components/Profile/Badges/ProfileBadge.vue'

const props = withDefaults(defineProps<{
  description?: string
}>(), {
  description: 'Joined in the early days of the community',
})
</script>

<template>
  <ProfileBadge
    label="Early Bird"
    :description="props.description"
    icon="ph:rocket-launch-bold"
    variant="gold"
  />
</template>
