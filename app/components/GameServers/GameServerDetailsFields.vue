<script setup lang="ts">
import type { GameServerDetailsFormState } from '@/lib/gameservers'
import { Button, Flex, Input, Textarea } from '@dolanske/vui'
import { defineAsyncComponent, ref } from 'vue'
import { useFieldUpdate } from '@/composables/useFieldUpdate'
import { STATIC_BUCKET_ID } from '@/lib/storageAssets'

const props = defineProps<{
  modelValue: GameServerDetailsFormState
  // Media uploads key off the saved row, so they wait for an id
  gameserverId?: number | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: GameServerDetailsFormState]
}>()

const RichTextEditor = defineAsyncComponent(() => import('@/components/Editor/RichTextEditor.vue'))

const update = useFieldUpdate(() => props.modelValue, value => emit('update:modelValue', value))

// Addresses

const newAddress = ref('')

function addAddress() {
  const address = newAddress.value.trim()
  if (!address)
    return

  update('addresses', [...props.modelValue.addresses, address])
  newAddress.value = ''
}

function removeAddress(index: number) {
  update('addresses', props.modelValue.addresses.filter((_, i) => i !== index))
}

// Editor passthrough
// The editor uploads pasted and dropped media lazily as blob placeholders.
// Callers flush before persisting, otherwise blob: URLs get saved.

const markdownEditor = ref<InstanceType<typeof RichTextEditor> | null>(null)

async function flushPendingUploads(): Promise<boolean> {
  return (await markdownEditor.value?.flushPendingUploads()) ?? true
}

defineExpose({ flushPendingUploads })
</script>

<template>
  <Flex column gap="l" expand>
    <Flex column gap="m" expand>
      <h4>Addresses</h4>

      <Flex gap="xs">
        <Input
          v-model="newAddress"
          expand
          placeholder="Enter server address"
          @keyup.enter="addAddress"
        />
        <Button :disabled="!newAddress.trim()" @click.stop="addAddress">
          <template #start>
            <Icon name="ph:plus" />
          </template>
          Add
        </Button>
      </Flex>

      <Flex v-if="modelValue.addresses.length > 0" gap="xs" wrap>
        <Flex
          v-for="(address, index) in modelValue.addresses"
          :key="`address-${index}`"
          gap="xs"
          y-center
          class="address-item"
        >
          <span class="flex-1 address-text">{{ address }}</span>
          <Button
            size="s"
            variant="danger"
            square
            @click.stop="removeAddress(index)"
          >
            <Icon name="ph:trash" />
          </Button>
        </Flex>
      </Flex>
    </Flex>

    <Flex column gap="m" expand>
      <h4>Content</h4>

      <Textarea
        :model-value="modelValue.description"
        expand
        name="description"
        label="Description"
        placeholder="Enter game server description (optional)"
        :rows="3"
        @update:model-value="update('description', $event)"
      />

      <RichTextEditor
        ref="markdownEditor"
        :model-value="modelValue.markdown"
        label="Content"
        hint="You can use markdown and add media by drag-and-drop"
        placeholder="Enter markdown content (optional)"
        min-height="216px"
        show-expand-button
        always-show-expand-button
        :media-context="gameserverId != null ? `gameservers/${gameserverId}/markdown/media` : undefined"
        :media-bucket-id="STATIC_BUCKET_ID"
        :show-attachment-button="gameserverId != null"
        @update:model-value="update('markdown', $event ?? '')"
      />
    </Flex>
  </Flex>
</template>

<style scoped lang="scss">
.flex-1 {
  flex: 1;
}

.address-item {
  padding: var(--space-xs) var(--space-s);
  background-color: var(--color-bg-raised);
  border-radius: var(--border-radius-s);
  border: 1px solid var(--color-border);
}

.address-text {
  font-family: monospace;
  font-size: var(--font-size-s);
  color: var(--color-text);
}
</style>
