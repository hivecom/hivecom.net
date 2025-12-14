<script setup lang="ts">
import { Alert, Button, Counter, Flex, Input, Modal, Radio, RadioGroup, Switch, Textarea } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'

type KvType = 'NUMBER' | 'BOOLEAN' | 'STRING' | 'JSON'

interface KvEntry {
  key: string
  type: KvType
  value: unknown
}

interface FormState {
  key: string
  type: KvType
  stringValue: string
  numberValue: number | undefined
  booleanValue: boolean
  jsonValue: string
}

const props = defineProps<{
  entry: KvEntry | null
  isEditMode: boolean
}>()

const emit = defineEmits<{
  (e: 'save', payload: { key: string, type: KvType, value: unknown }): void
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const form = ref<FormState>({
  key: '',
  type: 'STRING',
  stringValue: '',
  numberValue: undefined,
  booleanValue: false,
  jsonValue: '{ }',
})

const errorMessage = ref('')
const jsonError = ref('')

const typeOptions: { label: string, value: KvType, description: string }[] = [
  { label: 'String', value: 'STRING', description: 'Stores plain text' },
  { label: 'Number', value: 'NUMBER', description: 'Stores numeric values' },
  { label: 'Boolean', value: 'BOOLEAN', description: 'Stores true/false' },
  { label: 'JSON', value: 'JSON', description: 'Stores structured JSON' },
]

watch(
  () => props.entry,
  (entry) => {
    errorMessage.value = ''
    if (!entry) {
      form.value = {
        key: '',
        type: 'STRING',
        stringValue: '',
        numberValue: undefined,
        booleanValue: false,
        jsonValue: '{ }',
      }
      return
    }

    form.value.key = entry.key
    form.value.type = entry.type

    switch (entry.type) {
      case 'NUMBER':
        form.value.numberValue = (() => {
          if (typeof entry.value === 'number')
            return entry.value
          if (entry.value === null || entry.value === undefined)
            return undefined
          const parsed = Number(entry.value)
          return Number.isNaN(parsed) ? undefined : parsed
        })()
        form.value.booleanValue = false
        form.value.stringValue = ''
        form.value.jsonValue = '{ }'
        break
      case 'BOOLEAN':
        form.value.booleanValue = Boolean(entry.value)
        form.value.numberValue = undefined
        form.value.stringValue = ''
        form.value.jsonValue = '{ }'
        break
      case 'JSON':
        form.value.jsonValue = (() => {
          try {
            return JSON.stringify(entry.value, null, 2)
          }
          catch {
            return '{ }'
          }
        })()
        form.value.booleanValue = false
        form.value.numberValue = undefined
        form.value.stringValue = ''
        break
      case 'STRING':
      default:
        form.value.stringValue = entry.value !== null && entry.value !== undefined ? String(entry.value) : ''
        form.value.booleanValue = false
        form.value.numberValue = undefined
        form.value.jsonValue = '{ }'
        break
    }
  },
  { immediate: true },
)

function handleTypeChange(value: KvType) {
  form.value.type = value
  errorMessage.value = ''
  if (value !== 'JSON')
    jsonError.value = ''
  if (value === 'STRING') {
    form.value.stringValue = ''
  }
  if (value === 'NUMBER') {
    form.value.numberValue = undefined
  }
  if (value === 'BOOLEAN') {
    form.value.booleanValue = false
  }
  if (value === 'JSON') {
    form.value.jsonValue = '{ }'
    validateJson()
  }
}

function validateJson() {
  if (form.value.type !== 'JSON') {
    jsonError.value = ''
    return
  }

  try {
    JSON.parse(form.value.jsonValue || '{}')
    jsonError.value = ''
  }
  catch {
    jsonError.value = 'JSON is not valid'
  }
}

function parseValue(): { ok: true, value: unknown } | { ok: false, message: string } {
  switch (form.value.type) {
    case 'STRING':
      return { ok: true, value: form.value.stringValue }
    case 'NUMBER': {
      if (form.value.numberValue === undefined)
        return { ok: false, message: 'Enter a number' }
      const parsed = Number(form.value.numberValue)
      if (Number.isNaN(parsed))
        return { ok: false, message: 'Value must be a valid number' }
      return { ok: true, value: parsed }
    }
    case 'BOOLEAN':
      return { ok: true, value: form.value.booleanValue }
    case 'JSON': {
      validateJson()
      if (jsonError.value)
        return { ok: false, message: jsonError.value }
      const parsed = JSON.parse(form.value.jsonValue || '{}')
      return { ok: true, value: parsed }
    }
    default:
      return { ok: false, message: 'Unsupported type' }
  }
}

function handleSave() {
  errorMessage.value = ''
  const key = form.value.key.trim()
  if (!key) {
    errorMessage.value = 'Key is required'
    return
  }

  if (form.value.type === 'JSON')
    validateJson()
  if (jsonError.value) {
    errorMessage.value = jsonError.value
    return
  }

  const parsed = parseValue()
  if (!parsed.ok) {
    errorMessage.value = parsed.message
    return
  }

  emit('save', { key, type: form.value.type, value: parsed.value })
  isOpen.value = false
}

const isSaveDisabled = computed(() => {
  if (!form.value.key.trim())
    return true
  if (form.value.type === 'NUMBER' && (form.value.numberValue === undefined || Number.isNaN(Number(form.value.numberValue))))
    return true
  if (form.value.type === 'JSON' && !!jsonError.value)
    return true
  return false
})

watch(() => form.value.jsonValue, () => {
  if (form.value.type === 'JSON')
    validateJson()
})

function handleClose() {
  errorMessage.value = ''
  isOpen.value = false
}
</script>

<template>
  <Modal :open="isOpen" centered size="m" @close="handleClose">
    <template #header>
      <Flex column :gap="0">
        <h3>{{ props.isEditMode ? 'Edit Entry' : 'Add Entry' }}</h3>
        <p class="text-color-light text-xs">
          {{ props.isEditMode ? form.key : 'Create a new key/value pair' }}
        </p>
      </Flex>
    </template>

    <Flex column gap="m" expand>
      <Input
        v-model="form.key"
        label="Key"
        :disabled="props.isEditMode"
        placeholder="example.setting"
        required
        expand
      />

      <Flex column gap="xs" expand>
        <span class="text-xxs text-color-light">Value type</span>
        <RadioGroup v-model="form.type" column @update:model-value="value => handleTypeChange(value as KvType)">
          <Radio
            v-for="option in typeOptions"
            :key="option.value"
            :value="option.value"
            :label="option.label"
            :description="option.description"
          />
        </RadioGroup>
      </Flex>

      <Flex v-if="form.type === 'STRING'" expand>
        <Input
          v-model="form.stringValue"
          label="Value"
          placeholder="Enter text"
          expand
        />
      </Flex>

      <Flex v-else-if="form.type === 'NUMBER'" expand>
        <Counter
          v-model="form.numberValue"
          label="Value"
          hint="Enter a number"
          expand
        />
      </Flex>

      <Flex v-else-if="form.type === 'BOOLEAN'" y-center gap="s" expand>
        <Flex y-center gap="s">
          <Switch v-model="form.booleanValue" />
          <span>{{ form.booleanValue ? 'True' : 'False' }}</span>
        </Flex>
      </Flex>

      <Flex v-else-if="form.type === 'JSON'" expand column gap="xs">
        <Textarea
          v-model="form.jsonValue"
          label="JSON value"
          :rows="8"
          monospace
          placeholder="{&quot;key&quot;: &quot;value&quot;}"
          expand
          :class="{ 'textarea--error': !!jsonError }"
        />

        <span v-if="jsonError" class="text-xxs text-color-red">{{ jsonError }}</span>
      </Flex>

      <Alert v-if="errorMessage" variant="danger">
        {{ errorMessage }}
      </Alert>
    </Flex>

    <template #footer>
      <Flex gap="s" x-end>
        <Button variant="gray" @click="handleClose">
          Cancel
        </Button>
        <Button variant="accent" :disabled="isSaveDisabled" @click="handleSave">
          Save
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style lang="scss">
.textarea--error textarea {
  &,
  &:hover,
  &:focus,
  &:active {
    border-color: var(--color-text-red);
    box-shadow: 0 0 0 1px var(--color-text-red);
  }
}
</style>
