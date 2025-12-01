<script setup lang="ts">
import ProfileBadge from '@/components/Profile/Badges/ProfileBadge.vue'

const props = withDefaults(defineProps<{
  description?: string
}>(), {
  description: 'Monthly Patreon supporter of the community',
})
</script>

<template>
  <ProfileBadge
    label="Supporter"
    :description="props.description"
    icon="ph:heart-bold"
    variant="gold"
  />
</template>
