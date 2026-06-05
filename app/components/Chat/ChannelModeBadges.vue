<script setup lang="ts">
import type { ChatBuffer } from '@/composables/useIrcChat'
import { Tooltip } from '@dolanske/vui'
import { computed } from 'vue'

const props = defineProps<{
  buffer: ChatBuffer
}>()

interface ModeBadge {
  mode: string
  icon: string
  label: string
}

const MODE_BADGES: ModeBadge[] = [
  { mode: 'k', icon: 'ph:lock-simple', label: 'Password protected' },
  { mode: 'i', icon: 'ph:envelope-simple', label: 'Invite only' },
  { mode: 'm', icon: 'ph:microphone-slash', label: 'Moderated' },
  { mode: 's', icon: 'ph:eye-slash', label: 'Hidden from channel list' },
  { mode: 'r', icon: 'ph:seal-check', label: 'Registered users only' },
]

const activeBadges = computed(() => {
  const modes = props.buffer.modes
  if (!modes || modes.size === 0)
    return []
  return MODE_BADGES.filter(b => modes.has(b.mode))
})
</script>

<template>
  <Tooltip
    v-for="badge in activeBadges"
    :key="badge.mode"
    placement="top"
  >
    <Icon :name="badge.icon" size="10" class="chat-channels__mode-icon" />
    <template #tooltip>
      <p>{{ badge.label }}</p>
    </template>
  </Tooltip>
</template>

<style lang="scss" scoped>
.chat-channels__mode-icon {
  flex-shrink: 0;
  color: var(--color-text-lighter);
}
</style>
