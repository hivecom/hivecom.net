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
  font-size: var(--font-size-l);
  width: 32px;
  height: 32px;
  position: relative;

  span {
    font-size: var(--font-size-xxs);
    color: var(--color-text-light);
    position: absolute;
    top: -1px;
    right: -1px;
  }

  &:hover {
    background-color: var(--color-button-gray-hover);
  }
}
</style>
