<script setup lang="ts">
import type { StorageAsset } from '@/lib/storageAssets'
import { Button, Flex, Input, Modal } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import { normalizePrefix } from '@/lib/storageAssets'

const props = defineProps<{
  asset: StorageAsset | null
  loading?: boolean
}>()

const emit = defineEmits<{
  submit: [newName: string]
}>()

const isOpen = defineModel<boolean>('open', { default: false })
const isBelowSmall = useBreakpoint('<xs')

const newPath = ref('')
const errorMessage = ref('')

watch(() => props.asset, (asset) => {
  if (!isOpen.value)
    return
  newPath.value = asset?.path ?? ''
  errorMessage.value = ''
})

watch(isOpen, (open) => {
  if (open) {
    newPath.value = props.asset?.path ?? ''
    errorMessage.value = ''
  }
  else {
    errorMessage.value = ''
  }
})

const isSubmitDisabled = computed(() => {
  const trimmed = sanitizePath(newPath.value)
  if (!trimmed)
    return true
  if (!props.asset)
    return true
  if (trimmed === props.asset.path)
    return true
  return false
})

function handleSubmit() {
  const sanitized = sanitizePath(newPath.value)
  if (!sanitized) {
    errorMessage.value = 'Path is required'
    return
  }
  if (!props.asset) {
    errorMessage.value = 'Asset is missing'
    return
  }
  if (sanitized === props.asset.path) {
    errorMessage.value = 'Enter a different path'
    return
  }

  errorMessage.value = ''
  emit('submit', sanitized)
}

function sanitizePath(value: string): string {
  return normalizePrefix(value.trim())
}
</script>

<template>
  <Modal
    :open="isOpen && !!props.asset"
    centered
    :can-dismiss="!(props.loading)"
    :card="{ separators: true }"
    :size="isBelowSmall ? 'screen' : undefined"
    @close="isOpen = false"
  >
    <template #header>
      <h4>Rename Asset</h4>
      <span class="text-xs text-color-light">{{ props.asset?.path }}</span>
    </template>

    <Flex column gap="s">
      <Input
        v-model="newPath"
        label="New path"
        placeholder="Enter a new path"
        :disabled="props.loading"
        autofocus
        expand
      />
      <p v-if="errorMessage" class="text-xs text-color-danger">
        {{ errorMessage }}
      </p>
      <p class="text-xs text-color-light">
        File extensions are included in the name. Renaming will update the public URL.
      </p>
    </Flex>

    <template #footer="{ close }">
      <Flex gap="xs" x-end expand>
        <Button :expand="isBelowSmall" :disabled="props.loading" @click="close">
          Cancel
        </Button>
        <Button
          variant="accent"
          :expand="isBelowSmall"
          :loading="props.loading"
          :disabled="isSubmitDisabled || props.loading"
          @click="handleSubmit"
        >
          Rename
        </Button>
      </Flex>
    </template>
  </Modal>
</template>
