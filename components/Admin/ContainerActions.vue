<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'

defineProps<{
  container: {
    name: string
    running: boolean
    healthy: boolean | null
    started_at: string | null
    reported_at: string
    server: {
      id: number
      address: string
    } | null
  }
  status: string
  isLoading: Record<string, boolean>
}>()

defineEmits<{
  (e: 'action', container: any, action: 'start' | 'stop' | 'restart'): void
  (e: 'prune', container: any): void
}>()
</script>

<template>
  <Flex gap="xs">
    <Button
      v-if="['stopped'].includes(status)"
      size="s"
      variant="success"
      :loading="isLoading?.start"
      @click="$emit('action', container, 'start')"
    >
      <template #start>
        <Icon name="ph:play" />
      </template>
      Start
    </Button>
    <Button
      v-if="['running', 'healthy', 'unhealthy'].includes(status)"
      size="s"
      variant="danger"
      :loading="isLoading?.restart"
      @click="$emit('action', container, 'restart')"
    >
      <template #start>
        <Icon name="ph:play-circle" />
      </template>
      Restart
    </Button>
    <Button
      v-if="['running', 'healthy', 'unhealthy'].includes(status)"
      size="s"
      variant="danger"
      :loading="isLoading?.stop"
      @click="$emit('action', container, 'stop')"
    >
      <template #start>
        <Icon name="ph:stop" />
      </template>
      Stop
    </Button>
    <Button
      v-if="['stale'].includes(status)"
      size="s"
      variant="danger"
      :loading="isLoading?.prune"
      @click="$emit('prune', container)"
    >
      <template #start>
        <Icon name="ph:trash" />
      </template>
      Prune
    </Button>
  </Flex>
</template>
