<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { computed } from 'vue'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { useIrcChat } from '@/composables/useIrcChat'

const { activeBuffer, nick } = useIrcChat()
const { settings } = useDataUserSettings()

const typingNicks = computed(() => {
  if (!settings.value.chat_typing_indicators)
    return []
  return (activeBuffer.value?.typing ?? []).filter(n => n !== nick.value)
})

const label = computed(() => {
  const nicks = typingNicks.value
  if (nicks.length === 0)
    return null
  if (nicks.length === 1)
    return `${nicks[0]} is typing`
  if (nicks.length === 2)
    return `${nicks[0]} and ${nicks[1]} are typing`
  return 'Several people are typing'
})
</script>

<template>
  <Flex v-if="label" y-center gap="xs" class="chat-typing-indicator">
    <span class="chat-typing-indicator__dots" aria-hidden="true">
      <span /><span /><span />
    </span>
    <span class="chat-typing-indicator__text text-xs text-color-lighter">{{ label }}</span>
  </Flex>
</template>

<style lang="scss" scoped>
.chat-typing-indicator {
  padding: 0 var(--space-m);
  height: 18px;
  flex-shrink: 0;

  &__text {
    line-height: 1;
  }

  &__dots {
    display: flex;
    gap: 3px;
    align-items: center;

    span {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--color-text-lighter);
      animation: chat-typing-bounce 1.2s ease-in-out infinite;

      &:nth-child(2) {
        animation-delay: 0.15s;
      }

      &:nth-child(3) {
        animation-delay: 0.3s;
      }
    }
  }
}

@keyframes chat-typing-bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.5;
  }

  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
}
</style>
