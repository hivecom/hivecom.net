<script setup lang="ts">
import { Button } from '@dolanske/vui'
import NotificationCard from './NotificationCard.vue'

const props = withDefaults(defineProps<{ message?: string, to?: string | null }>(), {
  message: 'Unable to refresh',
  to: '/profile',
})

const emit = defineEmits<{ (e: 'retry'): void }>()

function handleRetry() {
  emit('retry')
}
</script>

<template>
  <NotificationCard :text="props.message" icon="ph:warning-circle" :to="props.to">
    <template #actions>
      <Button size="s" variant="gray" @click="handleRetry">
        Retry
      </Button>
    </template>
  </NotificationCard>
</template>
