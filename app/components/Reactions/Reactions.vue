<script setup lang="ts">
import type { ReactableTable } from '@/composables/useReactions'
import { useReactions } from '@/composables/useReactions'
import ReactionsList from './ReactionsList.vue'
import ReactionsSelect from './ReactionsSelect.vue'

export interface Reaction {
  // Url or a string content
  content: string
  // How many reactions are the same
  count: number
  // Whether the current user has reacted with this emote
  byMe: boolean
  // Which provider this reaction came from
  provider: string
}

const props = defineProps<{
  table: ReactableTable
  rowId: string | null | undefined
  /**
   * The raw reactions JSONB value from the already-fetched row.
   * The composable keeps a local copy and updates optimistically.
   */
  reactions?: unknown
}>()

const { displayReactions, toggleReaction, isLoading } = useReactions({
  table: props.table,
  rowId: toRef(props, 'rowId'),
  initialReactions: toRef(props, 'reactions'),
})

const userId = useUserId()
</script>

<template>
  <div class="reactions">
    <ReactionsList
      :reactions="displayReactions"
      :disabled="isLoading || !userId"
      @toggle="(emote, provider) => toggleReaction(emote, provider)"
    />
    <ReactionsSelect v-if="userId" @reaction="(emote) => toggleReaction(emote)" />
  </div>
</template>
