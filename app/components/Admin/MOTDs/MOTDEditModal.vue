<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Alert, Button, Flex, Input, Modal } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  entry: Tables<'motds'> | null
  isEditMode: boolean
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'save', payload: { id?: number, message: string }): void
}>()

const message = ref('')
const validationError = ref('')

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      message.value = props.entry?.message ?? ''
      validationError.value = ''
    }
  },
  { immediate: true },
)

const title = computed(() => props.isEditMode ? 'Edit MOTD' : 'Add MOTD')

function close() {
  emit('update:open', false)
}

function handleSubmit() {
  const nextMessage = message.value.trim()
  if (!nextMessage) {
    validationError.value = 'Message is required'
    return
  }

  if (nextMessage.length > 128) {
    validationError.value = 'Message must be 128 characters or fewer'
    return
  }

  validationError.value = ''
  emit('save', { id: props.entry?.id, message: nextMessage })
}
</script>

<template>
  <Modal
    :open="open"
    size="m"
    @close="close"
    @update:open="emit('update:open', $event)"
  >
    <template #header>
      <h4>{{ title }}</h4>
    </template>

    <Flex column gap="m">
      <Input
        v-model="message"
        expand
        label="Message"
        placeholder="Enter the message of the day"
        :maxlength="128"
      />

      <Alert v-if="validationError" variant="danger">
        {{ validationError }}
      </Alert>

      <Flex x-end gap="s">
        <Button variant="gray" @click="close">
          Cancel
        </Button>
        <Button variant="accent" @click="handleSubmit">
          {{ isEditMode ? 'Save Changes' : 'Add MOTD' }}
        </Button>
      </Flex>
    </Flex>
  </Modal>
</template>
