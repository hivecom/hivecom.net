<script setup lang="ts">
import type { Reaction } from './Reactions.vue'

const props = defineProps<{
  reactions: Reaction[]
}>()
</script>

<template>
  <Flex y-center gap="xs">
    <button v-for="reaction in props.reactions" :key="reaction.content" class="reactions__button">
      {{ reaction.content }}
      <span class="reactions__counter">{{ reaction.count }}</span>
    </button>
  </Flex>
</template>
