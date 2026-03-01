<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import ReactionsList from './ReactionsList.vue'
import ReactionsSelect from './ReactionsSelect.vue'

export interface Reaction {
  // Url or a string content
  content: string
  // How many reactions are the same
  count: number
}

// const props = defineProps<{
//   reactions: Reaction[]
// }>()
//

const SampleReactions: Reaction[] = [{ content: '👍', count: 5 }]
</script>

<template>
  <Flex y-center gap="xs">
    <ReactionsList :reactions="SampleReactions" />
    <ReactionsSelect />
  </Flex>
</template>

<style lang="scss">
// Not scoped to share styles between child components

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
}
</style>
