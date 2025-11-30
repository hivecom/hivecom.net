<script setup lang="ts">
import ProfileBadge from '@/components/Profile/Badges/ProfileBadge.vue'

const props = withDefaults(defineProps<{
  description?: string
}>(), {
  description: 'Contributed to open source development or infrastructure',
})
</script>

<template>
  <ProfileBadge
    label="Builder"
    :description="props.description"
    icon="ph:hammer"
    variant="silver"
  />
</template>
