<script setup lang="ts">
import ProfileBadge from '@/components/Profile/Badges/ProfileBadge.vue'

const props = withDefaults(defineProps<{
  description?: string
}>(), {
  description: 'Hosted or organized multiple events for the community.',
})
</script>

<template>
  <ProfileBadge
    label="Host"
    :description="props.description"
    icon="ph:users-three-bold"
    variant="silver"
  />
</template>
