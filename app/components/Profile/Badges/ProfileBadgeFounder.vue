<script setup lang="ts">
import ProfileBadge from '@/components/Profile/Badges/ProfileBadge.vue'

const props = withDefaults(defineProps<{
  description?: string
}>(), {
  description: 'One of the original founders',
})
</script>

<template>
  <ProfileBadge
    label="Founder"
    :description="props.description"
    icon="ph:crown-simple-bold"
    variant="shiny"
  />
</template>
