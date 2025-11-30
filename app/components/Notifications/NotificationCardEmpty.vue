<script setup lang="ts">
import NotificationCard from './NotificationCard.vue'

const props = withDefaults(defineProps<{ message?: string }>(), {
  message: 'All caught up',
})
</script>

<template>
  <NotificationCard :text="props.message" icon="ph:smiley" />
</template>
