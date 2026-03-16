<script setup lang="ts">
import { Button } from '@dolanske/vui'
import NotificationCard from './NotificationCard.vue'

const props = withDefaults(defineProps<{ message?: string }>(), {
  message: 'Unable to refresh',
})

const emit = defineEmits<{ (e: 'retry'): void }>()
</script>

<template>
  <NotificationCard :text="props.message" icon="ph:warning-circle">
    <template #actions>
      <Button size="s" variant="gray" @click="emit('retry')">
        Retry
      </Button>
    </template>
  </NotificationCard>
</template>
