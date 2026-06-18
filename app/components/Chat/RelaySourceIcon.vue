<script setup lang="ts">
import { Tooltip } from '@dolanske/vui'
import { bridgeInfo } from '@/lib/chat/bridgeInfo'

const props = defineProps<{
  bridge?: string | null
  relayedBy?: string | null
  size?: number
}>()

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
