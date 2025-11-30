<script setup lang="ts">
import ProfileBadge from '@/components/Profile/Badges/ProfileBadge.vue'

const props = withDefaults(defineProps<{
  description?: string
}>(), {
  description: 'Contributed to the community in a significant way',
})
</script>

<template>
  <ProfileBadge
    label="Lifetime"
    :description="props.description"
    icon="ph:infinity-bold"
    variant="gold"
  />
</template>
