<script setup lang="ts">
import { Tooltip } from '@dolanske/vui'

const props = defineProps<{
  bridge?: string | null
  relayedBy?: string | null
  size?: number
}>()

function bridgeInfo(bridge: string): { icon: string, label: string } {
  const b = bridge.toLowerCase()
  if (b === 'tele' || b === 'telegram')
    return { icon: 'ph:telegram-logo', label: 'Telegram' }
  if (b === 'cord' || b === 'discord')
    return { icon: 'ph:discord-logo', label: 'Discord' }
  return { icon: 'ph:swap', label: bridge }
}

const info = computed(() => props.bridge ? bridgeInfo(props.bridge) : null)
</script>

<template>
  <Tooltip>
    <Icon
      :name="info ? info.icon : 'ph:warning'"
      :size="size ?? 14"
      :class="info ? 'text-color-lightest' : 'text-color-yellow'"
      style="flex-shrink: 0"
    />
    <template #tooltip>
      <p v-if="info">
        Relay message from {{ info.label }}{{ relayedBy ? ` by ${relayedBy}` : '' }}
      </p>
      <p v-else>
        Relay message with no source{{ relayedBy ? ` by ${relayedBy}` : '' }}
      </p>
    </template>
  </Tooltip>
</template>
