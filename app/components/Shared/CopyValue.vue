<script setup lang="ts">
import { Button, CopyClipboard } from '@dolanske/vui'

defineProps<{
  text: string
}>()
</script>

<template>
  <div class="copy-value" @click.stop>
    <CopyClipboard :text="text" confirm>
      <Button variant="gray" plain size="s" class="copy-value-button">
        <template #start>
          <Icon name="ph:copy" />
        </template>
        <span class="text-xxs">{{ text }}</span>
      </Button>
    </CopyClipboard>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/mixins' as *;

.copy-value {
  overflow: hidden;
  display: block;
  max-width: 100%;

  @include line-clamp(1);
}

.copy-value-button {
  font-family: monospace;
  font-size: var(--font-size-xs);
}
</style>
