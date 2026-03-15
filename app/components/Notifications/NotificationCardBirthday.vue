<script setup lang="ts">
import NotificationCard from './NotificationCard.vue'

const props = withDefaults(defineProps<{ title: string, description?: string | null, to?: string | null }>(), {
  description: null,
  to: '/profile',
})
</script>

<template>
  <NotificationCard
    :text="props.title"
    :description="props.description"
    icon="ph:cake"
    shiny
    :to="props.to"
  />
</template>
