<script setup lang="ts">
import { Modal } from '@dolanske/vui'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <Modal v-bind="props" @close="emit('close')" />
</template>
