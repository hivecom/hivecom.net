<script setup lang="ts">
import { Alert, Button, Flex, Modal } from '@dolanske/vui'

defineProps<{
  open: boolean
  loading: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()
</script>

<template>
  <Modal
    :open="open"
    size="s"
    centered
    :card="{ separators: true }"
    @close="emit('close')"
  >
    <template #header>
      <h4>Permanently delete reply</h4>
    </template>

    <Flex column gap="m">
      <Alert variant="danger" icon-align="start" filled>
        <p><strong>This cannot be undone.</strong> The reply row will be hard-deleted from the database.</p>
      </Alert>
      <p class="text-color-light text-m text-justified">
        If other replies quote or reply to this one, they will become orphaned - their reply context will break and the thread flow may appear confusing to readers. Force deletion is <strong class="text-m">heavily discouraged</strong> unless the reply has no dependents.
      </p>
    </Flex>

    <template #footer>
      <Flex x-end gap="s">
        <Button plain :inert="loading" @click="emit('close')">
          Cancel
        </Button>
        <Button variant="danger" :loading="loading" @click="emit('confirm')">
          Delete
        </Button>
      </Flex>
    </template>
  </Modal>
</template>
