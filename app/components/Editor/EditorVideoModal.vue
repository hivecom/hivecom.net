<script setup lang="ts">
import { Button, Flex, Input, Modal } from '@dolanske/vui'
import { ref, watch } from 'vue'

const emit = defineEmits<{
  confirm: [url: string]
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const url = ref('')

watch(isOpen, (open) => {
  if (!open)
    url.value = ''
})

function handleConfirm() {
  const trimmed = url.value.trim()
  if (!trimmed)
    return

  emit('confirm', trimmed)
  isOpen.value = false
}
</script>

<template>
  <Modal
    :open="isOpen"
    centered
    :card="{ separators: true }"
    size="s"
    @close="isOpen = false"
  >
    <template #header>
      <h4>Insert video</h4>
    </template>

    <Flex column gap="m">
      <Input
        v-model="url"
        label="Video URL"
        placeholder="https://example.com/video.mp4"
        autofocus
        expand
        @keydown.enter.prevent="handleConfirm"
      />

      <p class="video-modal-hint">
        Paste a direct link to a video file (MP4, WebM, or OGG). The video will
        be embedded directly in the content. To upload a file instead, use the
        attach button.
      </p>
    </Flex>

    <template #footer="{ close }">
      <Flex :gap="8" x-end expand>
        <Button @click="close">
          Cancel
        </Button>
        <Button
          variant="accent"
          :disabled="!url.trim()"
          @click="handleConfirm"
        >
          Insert
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style scoped lang="scss">
.video-modal-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-light);
}
</style>
