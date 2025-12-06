<script setup lang="ts">
import { Button, Flex, Modal } from '@dolanske/vui'

const props = defineProps<{
  title: string | undefined
  description: string | undefined
  confirmText: string | undefined
  cancelText: string | undefined
  destructive: boolean | undefined
}>()

const open = defineModel<boolean>('open', { default: false })
const confirm = defineModel<() => void>('confirm', { default: () => {} })
</script>

<template>
  <Modal :open="open" centered :card="{ separators: true }" :can-dismiss="false" @close="open = false">
    <template #header>
      <h4>{{ props.title }}</h4>
    </template>
    <p>{{ props.description }}</p>
    <template #footer="{ close }">
      <Flex gap="xs">
        <Button @click="close">
          {{ props.cancelText || 'Cancel' }}
        </Button>
        <Button
          :variant="props.destructive ? 'danger' : 'fill'"
          @click="() => {
            confirm()
            close()
          }"
        >
          {{ props.confirmText || 'Confirm' }}
        </Button>
      </Flex>
    </template>
  </Modal>
</template>
