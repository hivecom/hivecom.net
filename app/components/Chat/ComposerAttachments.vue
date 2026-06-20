<script setup lang="ts">
import type { ChatAttachment } from '@/composables/useChatAttachments'
import { Button, Flex, Spinner } from '@dolanske/vui'

defineProps<{
  attachments: ChatAttachment[]
}>()

defineEmits<{
  remove: [id: string]
}>()

function formatSize(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Pick a rough icon for non-image files so the chip reads at a glance.
function fileIcon(file: File): string {
  const t = file.type
  if (t.startsWith('video/'))
    return 'ph:file-video'
  if (t.startsWith('audio/'))
    return 'ph:file-audio'
  if (t.includes('pdf'))
    return 'ph:file-pdf'
  if (t.includes('zip') || t.includes('compressed') || t.includes('tar'))
    return 'ph:file-zip'
  if (t.startsWith('text/'))
    return 'ph:file-text'
  return 'ph:file'
}
</script>

<template>
  <Flex wrap gap="xs" class="chat-attachments" expand>
    <div
      v-for="att in attachments"
      :key="att.id"
      class="chat-attachments__item"
      :class="{
        'chat-attachments__item--uploading': att.status === 'uploading',
        'chat-attachments__item--error': att.status === 'error',
      }"
    >
      <div class="chat-attachments__thumb">
        <img v-if="att.previewUrl" :src="att.previewUrl" :alt="att.file.name" class="chat-attachments__img">
        <Icon v-else :name="fileIcon(att.file)" size="18" class="chat-attachments__icon" />
        <div v-if="att.status === 'uploading'" class="chat-attachments__overlay">
          <Spinner size="s" />
        </div>
      </div>
      <Flex column :gap="0" class="chat-attachments__meta">
        <span class="chat-attachments__name">{{ att.file.name }}</span>
        <span class="chat-attachments__size">{{ att.status === 'error' ? 'Failed' : formatSize(att.file.size) }}</span>
      </Flex>
      <Button
        plain
        square
        size="s"
        class="chat-attachments__remove"
        aria-label="Remove attachment"
        @click="$emit('remove', att.id)"
      >
        <Icon name="ph:x" size="12" />
      </Button>
    </div>
  </Flex>
</template>

<style lang="scss" scoped>
.chat-attachments {
  padding: var(--space-xxs) 0;

  &__item {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    max-width: 220px;
    padding: var(--space-xxs);
    padding-right: var(--space-xxs);
    background: var(--color-bg-medium);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-s);

    &--uploading {
      opacity: 0.8;
    }

    &--error {
      border-color: var(--color-text-red, var(--color-border));
    }
  }

  &__thumb {
    position: relative;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--border-radius-xs);
    background: var(--color-bg);
    overflow: hidden;
  }

  &__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &__icon {
    color: var(--color-text-light);
  }

  &__overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
  }

  &__meta {
    min-width: 0;
  }

  &__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-xs);
    color: var(--color-text);
  }

  &__size {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
  }

  &__remove {
    flex-shrink: 0;
    color: var(--color-text-lighter);

    &:hover {
      color: var(--color-text);
    }
  }
}
</style>
