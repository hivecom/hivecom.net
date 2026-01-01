<script setup lang="ts">
import { Button, Flex, Modal } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  title: string | undefined
  description: string | undefined
  confirmText: string | undefined
  cancelText: string | undefined
  destructive: boolean | undefined
}>()

const open = defineModel<boolean>('open', { default: false })
const confirm = defineModel<() => void>('confirm', { default: () => {} })
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
        <Button :expand="isBelowSmall" @click="close">
          {{ props.cancelText || 'Cancel' }}
        </Button>
        <Button
          :expand="isBelowSmall"
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
