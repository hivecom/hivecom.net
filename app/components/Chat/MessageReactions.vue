<script setup lang="ts">
import type { ChatMessage } from '@/composables/useIrcChat'
import type { DisplayReaction } from '@/lib/reactions'
import { computed } from 'vue'
import ReactionsList from '@/components/Reactions/ReactionsList.vue'
import { useIrcChat } from '@/composables/useIrcChat'

const props = defineProps<{
  message: ChatMessage

  /** Rendered inside the IRC text line rather than on its own row. */
  inline?: boolean
}>()

const { nick, toggleReaction } = useIrcChat()

// Derive a sorted, display-ready list from the raw reaction map (emote -> nicks).
const reactions = computed<DisplayReaction[]>(() => {
  const raw = props.message.reactions
  if (!raw)
    return []

  return Object.entries(raw)
    .filter(([, reactors]) => reactors.length > 0)
    .map(([content, reactors]) => ({
      content,
      count: reactors.length,
      byMe: reactors.includes(nick.value),
      provider: 'irc',
      reactors: [...reactors],
    }))
    .sort((a, b) => b.count - a.count || a.content.localeCompare(b.content))
})

function onToggle(emote: string, _provider: string) {
  toggleReaction(props.message, emote)
}
</script>

<template>
  <ReactionsList
    v-if="reactions.length"
    :reactions="reactions"
    small
    nick-reactors
    class="chat-reactions"
    :class="{ 'chat-reactions--inline': props.inline }"
    @toggle="onToggle"
  />
</template>

<style lang="scss" scoped>
.chat-reactions {
  display: inline-flex;
  vertical-align: middle;
  margin-left: var(--space-xs);
}

// In the IRC row the chips sit inside the text line, and they're taller than
// that line box. Pinning the container to a height the line box already has
// room for and letting the chips overflow it keeps rows the same height
// whether or not they carry a reaction.
.chat-reactions--inline {
  align-items: center;
  gap: 2px;
  height: 1em;
  vertical-align: -0.15em;
  margin-left: var(--space-xxs);

  :deep(.reactions__button) {
    height: calc(var(--chat-font-size, var(--font-size-s)) * 1.5);
    min-width: calc(var(--chat-font-size, var(--font-size-s)) * 1.5);
    width: auto;
    padding: 0 var(--space-xxs);
    font-size: var(--chat-font-size, var(--font-size-s));
    line-height: 1;
  }

  :deep(.reactions__counter) {
    font-size: calc(var(--chat-font-size, var(--font-size-s)) * 0.85);
  }
}
</style>
