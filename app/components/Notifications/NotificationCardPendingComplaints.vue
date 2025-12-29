<script setup lang="ts">
import NotificationCard from './NotificationCard.vue'

const props = withDefaults(defineProps<{ count: number, to?: string | null }>(), {
  to: '/admin/complaints',
})
</script>

<template>
  <NotificationCard
    icon="ph:flag"
    text="Pending complaints"
    :badge="props.count"
    highlight
    :to="props.to"
  />
</template>
