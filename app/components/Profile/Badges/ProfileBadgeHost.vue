<script setup lang="ts">
import ProfileBadge from '@/components/Profile/Badges/ProfileBadge.vue'

const props = withDefaults(defineProps<{
  description?: string
  compact?: boolean
}>(), {
  description: 'Hosted or organized multiple events for the community.',
  compact: false,
})
</script>

<template>
  <ProfileBadge
    label="Host"
    :description="props.description"
    icon="ph:users-three-bold"
    variant="silver"
    :compact="props.compact"
  />
</template>
