<script setup lang="ts">
import type { ChatMessage } from '@/composables/useIrcChat'
import type { DisplayReaction } from '@/lib/reactions'
import { computed } from 'vue'
import ReactionsList from '@/components/Reactions/ReactionsList.vue'
import { useIrcChat } from '@/composables/useIrcChat'

const props = defineProps<{ message: ChatMessage }>()

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
    @toggle="onToggle"
  />
</template>

<style lang="scss" scoped>
.chat-reactions {
  display: inline-flex;
  vertical-align: middle;
  margin-left: var(--space-xs);
}
</style>
