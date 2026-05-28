<script setup lang="ts">
import { Button, CopyClipboard } from '@dolanske/vui'

defineProps<{
  text: string
  hideIcon?: boolean
  wrap?: boolean
  danger?: boolean
  link?: boolean
}>()
</script>

<template>
  <div class="copy-value" :class="{ 'copy-value--wrap': wrap }" @click.stop>
    <CopyClipboard :text="text" confirm>
      <Button
        :variant="link ? 'link' : 'gray'"
        :plain="!link"
        size="s"
        class="copy-value-button"
        :class="{ 'copy-value-button--danger': danger,
                  'copy-value-button--link': link }"
      >
        <template v-if="!hideIcon" #start>
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

  &--wrap {
    display: block;
    overflow: visible;
    white-space: normal;
    -webkit-line-clamp: unset;
    -webkit-box-orient: unset;

    :deep(.vui-button-slot-default) {
      white-space: normal;
    }

    :deep(.vui-button) {
      height: auto;
      min-height: var(--button-height);
    }
  }
}

.copy-value-button {
  font-family: monospace;
  font-size: var(--font-size-xs);

  &--danger span {
    color: var(--color-text-red);
  }

  &--link {
    padding-inline: 0;
  }
}
</style>
