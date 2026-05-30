<script setup lang="ts">
import { Badge } from '@dolanske/vui'
import { useIrcChat } from '@/composables/useIrcChat'

const { connState } = useIrcChat()

const variant = computed(() => ({
  disconnected: 'neutral' as const,
  connecting: 'info' as const,
  connected: 'success' as const,
  error: 'danger' as const,
}[connState.value]))

const label = computed(() => ({
  disconnected: 'Disconnected',
  connecting: 'Connecting...',
  connected: 'Connected',
  error: 'Error',
}[connState.value]))
</script>

<template>
  <Badge :variant="variant" filled>
    {{ label }}
  </Badge>
</template>
