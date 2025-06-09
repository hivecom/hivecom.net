<script setup lang="ts">
import { Button, Flex, Input, Modal, Select } from '@dolanske/vui'

const props = defineProps<{
  user: {
    id: string
    username: string
  }
}>()

const emit = defineEmits<{
  (e: 'ban', banDuration: string): void
}>()

const open = defineModel<boolean>('open', { default: false })

// Ban duration options
const banDurationOptions = [
  { label: '1 hour', value: '1h' },
  { label: '6 hours', value: '6h' },
  { label: '24 hours', value: '24h' },
  { label: '3 days', value: '72h' },
  { label: '1 week', value: '168h' },
  { label: '2 weeks', value: '336h' },
  { label: '1 month', value: '720h' },
  { label: '3 months', value: '2160h' },
  { label: '6 months', value: '4320h' },
  { label: '1 year', value: '8760h' },
  { label: 'Permanent', value: 'permanent' },
]

const selectedDuration = ref<{ label: string, value: string }[]>([])
const customDuration = ref('')
const useCustomDuration = ref(false)
const banReason = ref('')

function handleBan() {
  let duration = ''

  if (useCustomDuration.value) {
    duration = customDuration.value
  }
  else if (selectedDuration.value.length > 0) {
    duration = selectedDuration.value[0].value
  }

  if (!duration) {
    return
  }

  emit('ban', duration)
  resetForm()
}

function resetForm() {
  selectedDuration.value = []
  customDuration.value = ''
  useCustomDuration.value = false
  banReason.value = ''
}

function handleClose() {
  resetForm()
  open.value = false
}
</script>

<template>
  <Modal :open="open" @close="handleClose">
    <template #header>
      <h3>Ban User: {{ props.user.username }}</h3>
    </template>

    <Flex column gap="m" class="ban-modal-content">
      <p>Select the duration for banning this user:</p>

      <Flex column gap="s">
        <label>
          <input
            v-model="useCustomDuration"
            type="radio"
            :value="false"
            name="durationType"
          >
          Choose from preset durations
        </label>

        <Select
          v-if="!useCustomDuration"
          v-model="selectedDuration"
          :options="banDurationOptions"
          placeholder="Select ban duration"
          :disabled="useCustomDuration"
        />
      </Flex>

      <Flex column gap="s">
        <label>
          <input
            v-model="useCustomDuration"
            type="radio"
            :value="true"
            name="durationType"
          >
          Custom duration
        </label>

        <Input
          v-if="useCustomDuration"
          v-model="customDuration"
          placeholder="e.g., 5h, 30m, 7d, permanent"
          :disabled="!useCustomDuration"
        />
      </Flex>

      <Input
        v-model="banReason"
        placeholder="Reason for ban (optional)"
        multiline
        :rows="3"
      />
    </Flex>

    <template #footer>
      <Flex gap="s" x-end>
        <Button variant="gray" @click="handleClose">
          Cancel
        </Button>
        <Button
          variant="danger"
          :disabled="selectedDuration.length === 0 && !customDuration"
          @click="handleBan"
        >
          Ban User
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style scoped>
.ban-modal-content {
  min-width: 400px;
}

label {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--font-size-s);
  cursor: pointer;
}

input[type='radio'] {
  margin: 0;
}
</style>
