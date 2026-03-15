<script setup lang="ts">
import { Spinner } from '@dolanske/vui'
import NotificationCard from './NotificationCard.vue'

const props = withDefaults(defineProps<{ text?: string }>(), {
  text: 'Loading updates',
})
</script>

<template>
  <NotificationCard :text="props.text" icon="ph:bell">
    <Spinner size="s" />
  </NotificationCard>
</template>
