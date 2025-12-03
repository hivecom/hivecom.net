<script setup lang="ts">
import ProfileBadge from '@/components/Profile/Badges/ProfileBadge.vue'

const props = withDefaults(defineProps<{
  description?: string
  compact?: boolean
}>(), {
  description: 'One of the original founders',
  compact: false,
})
</script>

<template>
  <ProfileBadge
    label="Founder"
    :description="props.description"
    icon="ph:crown-simple-bold"
    variant="shiny"
    :compact="props.compact"
  />
</template>
