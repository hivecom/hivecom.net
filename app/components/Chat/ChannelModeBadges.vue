<script setup lang="ts">
import { Badge, Flex, Tooltip } from '@dolanske/vui'
import { computed } from 'vue'

const props = defineProps<{
  modes: Set<string> | undefined
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
  const modes = props.modes
  if (!modes || modes.size === 0)
    return []
  return MODE_BADGES.filter(b => modes.has(b.mode))
})
</script>

<template>
  <Flex y-center gap="xxs">
    <Tooltip
      v-for="badge in activeBadges"
      :key="badge.mode"
      placement="top"
    >
      <Badge size="s" outline>
        <Icon :name="badge.icon" size="12" class="chat-channels__mode-icon" />
      </Badge>
      <template #tooltip>
        <p>{{ badge.label }}</p>
      </template>
    </Tooltip>
  </Flex>
</template>

<style lang="scss" scoped>
.chat-channels__mode-icon {
  color: var(--color-text-lighter);
}
</style>
