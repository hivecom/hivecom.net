<script setup lang="ts">
import { Button, Flex, Modal } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  title?: string
  description?: string
  confirmText?: string
  confirmLoading?: boolean
  cancelText?: string
  destructive?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const open = defineModel<boolean>('open', { default: false })
// FIXME: get rid of this, use emit instead
const confirmOld = defineModel<() => void>('confirm', { default: () => {}, required: false })
const isBelowSmall = useBreakpoint('<xs')
</script>

<template>
  <Modal
    :open="open"
    centered
    :card="{ footerSeparator: true }"
    :can-dismiss="false"
    :size="isBelowSmall ? 'screen' : 's'"
    @close="open = false"
  >
    <template #header>
      <Flex column gap="s">
        <h4>{{ props.title }}</h4>
        <p>{{ props.description }}</p>
      </Flex>
    </template>

    <slot />

    <template #footer="{ close }">
      <Flex gap="xs" expand x-end>
        <Button :expand="isBelowSmall" @click="close(); emit('cancel')">
          {{ props.cancelText || 'Cancel' }}
        </Button>
        <Button
          :expand="isBelowSmall"
          :loading="props.confirmLoading"
          :variant="props.destructive ? 'danger' : 'fill'"
          @click="() => {
            emit('confirm')
            confirmOld()
            close()
          }"
        >
          {{ props.confirmText || 'Confirm' }}
        </Button>
      </Flex>
    </template>
  </Modal>
</template>
