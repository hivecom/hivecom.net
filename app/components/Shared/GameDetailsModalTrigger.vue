<script setup lang="ts">
import { ref } from 'vue'
import GameDetailsModal from '@/components/Shared/GameDetailsModal.vue'

interface Props {
  gameId?: number | null
}

const props = withDefaults(defineProps<Props>(), {
  gameId: null,
})

const isOpen = ref(false)

function open() {
  if (!props.gameId)
    return

  isOpen.value = true
}

function close() {
  isOpen.value = false
}
</script>

<template>
  <slot :open="open" :close="close" :is-open="isOpen" />
  <GameDetailsModal
    v-if="props.gameId"
    v-model:open="isOpen"
    :game-id="props.gameId"
    @close="close"
  />
</template>
