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
</script>

<template>
  <div class="reactions">
    <ReactionsList
      :reactions="displayReactions"
      :disabled="isLoading"
      @toggle="(emote, provider) => toggleReaction(emote, provider)"
    />
    <ReactionsSelect @reaction="(emote) => toggleReaction(emote)" />
  </div>
</template>

<style lang="scss">
// Not scoped to share styles between child components

.reactions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-xs);
  margin-left: auto;
  min-width: 0;
  flex-shrink: 1;
}

.reactions__button {
  display: flex;
  border-radius: var(--border-radius-m);
  font-size: var(--font-size-m);
  width: 32px;
  height: 32px;
  position: relative;
  justify-content: center;
  align-items: center;

  .reactions__counter {
    font-size: var(--font-size-xxs);
    color: var(--color-text-light);
    position: absolute;
    top: 2px;
    right: 2px;
  }

  &:hover {
    background-color: var(--color-button-gray-hover);
  }

  &.reactions__button--active {
    background-color: color-mix(in srgb, var(--color-accent) 12%, transparent);
    outline: 1px solid color-mix(in srgb, var(--color-accent) 40%, transparent);

    .reactions__counter {
      color: var(--color-accent);
    }

    &:hover {
      background-color: color-mix(in srgb, var(--color-accent) 20%, transparent);
    }
  }
}
</style>
