<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Alert, Button, Flex, Modal, Textarea } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import { useBreakpoint } from '@/lib/mediaQuery'

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
const isBelowSmall = useBreakpoint('<xs')

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
    :size="isBelowSmall ? 'screen' : 'm'"
    :card="{ separators: true }"
    @close="close"
    @update:open="emit('update:open', $event)"
  >
    <template #header>
      <Flex column gap="xxs">
        <h3>{{ title }}</h3>
        <p class="text-color-light text-m">
          Avoid writing offensive things.
        </p>
      </Flex>
    </template>

    <Flex column gap="m">
      <Textarea
        v-model="message"
        autofocus
        expand
        label="Message"
        placeholder="Enter the message of the day"
        :limit="128"
        :rows="2"
        :resize="false"
        focus
      />

      <Alert v-if="validationError" variant="danger">
        {{ validationError }}
      </Alert>
    </Flex>
    <template #footer>
      <Flex x-end gap="s" expand>
        <Button variant="gray" :expand="isBelowSmall" @click="close">
          Cancel
        </Button>
        <Button variant="accent" :expand="isBelowSmall" @click="handleSubmit">
          {{ isEditMode ? 'Save Changes' : 'Add MOTD' }}
        </Button>
      </Flex>
    </template>
  </Modal>
</template>
