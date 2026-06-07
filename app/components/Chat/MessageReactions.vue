<script setup lang="ts">
import type { ChatMessage } from '@/composables/useIrcChat'
import { Flex, Tooltip } from '@dolanske/vui'
import { computed } from 'vue'
import { useIrcChat } from '@/composables/useIrcChat'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{ message: ChatMessage }>()

const { nick, toggleReaction } = useIrcChat()
const isMobile = useBreakpoint('<s')

interface ChatReaction {
  content: string
  count: number
  byMe: boolean
  reactors: string[]
}

// Derive a sorted, display-ready list from the raw reaction map (value -> nicks).
const reactions = computed<ChatReaction[]>(() => {
  const raw = props.message.reactions
  if (!raw)
    return []
  return Object.entries(raw)
    .filter(([, reactors]) => reactors.length > 0)
    .map(([content, reactors]) => ({
      content,
      count: reactors.length,
      byMe: reactors.includes(nick.value),
      reactors: [...reactors],
    }))
    .sort((a, b) => b.count - a.count || a.content.localeCompare(b.content))
})
</script>

<template>
  <Flex v-if="reactions.length" wrap y-center gap="xxs" class="chat-reactions">
    <Tooltip v-for="reaction in reactions" :key="reaction.content" placement="top" :disabled="isMobile">
      <button
        type="button"
        class="reactions__button"
        :class="{ 'reactions__button--active': reaction.byMe }"
        @click="toggleReaction(props.message, reaction.content)"
      >
        {{ reaction.content }}
        <span class="reactions__counter">{{ reaction.count }}</span>
      </button>
      <template #tooltip>
        {{ reaction.reactors.join(', ') }}
      </template>
    </Tooltip>
  </Flex>
</template>

<style lang="scss" scoped>
.chat-reactions {
  margin-top: var(--space-xxs);

  // Reuse the global .reactions__button chip sizing but make chat chips denser.
  :deep(.reactions__button),
  .reactions__button {
    height: 22px;
    min-width: 22px;
    font-size: var(--font-size-s);
  }
}
</style>
