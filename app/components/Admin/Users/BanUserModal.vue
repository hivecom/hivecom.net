<script setup lang="ts">
import { Button, Flex, Input, Modal, Radio, RadioGroup, Select, Textarea } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  user: {
    id: string
    username: string
  }
}>()

const emit = defineEmits<{
  (e: 'ban', banData: { duration: string, reason?: string }): void
}>()

const open = defineModel<boolean>('open', { default: false })
const isBelowSmall = useBreakpoint('<xs')

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
const useCustomDuration = ref('preset') // 'preset' or 'custom'
const banReason = ref('')

function handleBan() {
  let duration = ''

  if (useCustomDuration.value === 'custom') {
    duration = customDuration.value
  }
  else if (selectedDuration.value.length > 0 && selectedDuration.value[0]) {
    duration = selectedDuration.value[0].value
  }

  if (!duration) {
    return
  }

  emit('ban', {
    duration,
    reason: banReason.value || undefined,
  })
  resetForm()
}

function resetForm() {
  selectedDuration.value = []
  customDuration.value = ''
  useCustomDuration.value = 'preset'
  banReason.value = ''
}

function handleClose() {
  resetForm()
  open.value = false
}
</script>

<template>
  <Modal :open="open" :size="isBelowSmall ? 'screen' : undefined" :card="{ separators: true }" @close="handleClose">
    <template #header>
      <h3>Ban User: {{ props.user.username }}</h3>
    </template>

    <Flex column gap="m" class="ban-modal-content">
      <p>Select the duration for banning this user:</p>

      <RadioGroup v-model="useCustomDuration" column>
        <Radio value="preset" label="Choose from preset durations" />
        <Radio value="custom" label="Custom duration" />
      </RadioGroup>

      <Select
        v-if="useCustomDuration === 'preset'"
        v-model="selectedDuration"
        :options="banDurationOptions"
        placeholder="Select ban duration"
      />

      <Input
        v-if="useCustomDuration === 'custom'"
        v-model="customDuration"
        placeholder="e.g., 5h, 30m, 7d, permanent"
      />

      <Textarea
        v-model="banReason"
        expand
        placeholder="Reason for ban (optional)"
        multiline
        :rows="3"
      />
    </Flex>

    <template #footer>
      <Flex gap="s" x-end expand>
        <Button variant="gray" :expand="isBelowSmall" @click="handleClose">
          Cancel
        </Button>
        <Button
          variant="danger"
          :expand="isBelowSmall"
          :disabled="(useCustomDuration === 'preset' && selectedDuration.length === 0) || (useCustomDuration === 'custom' && !customDuration)"
          @click="handleBan"
        >
          Ban User
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style scoped lang="scss">
.ban-modal-content {
  min-width: 400px;
}
</style>
