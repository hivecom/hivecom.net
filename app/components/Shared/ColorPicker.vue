<script setup lang="ts">
import { Button, Color, Flex } from '@dolanske/vui'

/**
 * ColorPicker - two layout variants around VUI's <Color> input:
 *
 * Stacked: label above, Color input below. Pass `clearable` for a clear button.
 *   <ColorPicker v-model="color" label="Accent Color" stacked clearable />
 *
 * Inline: Color input with label alongside (dense list style).
 *   <ColorPicker v-model="color" label="--color-bg" />
 */

const props = defineProps<{
  label?: string
  stacked?: boolean
  clearable?: boolean
  error?: string
}>()

const emit = defineEmits<{
  (e: 'reset'): void
}>()

const model = defineModel<string>({ default: '' })

function clear() {
  model.value = ''
  emit('reset')
}
</script>

<template>
  <!-- Stacked: label above -->
  <Flex v-if="props.stacked" column gap="xs" expand>
    <label v-if="props.label" class="color-picker__label">{{ props.label }}</label>
    <Flex y-center gap="xs" expand>
      <Color v-model="model" expand :errors="props.error ? [props.error] : undefined" />
      <Button
        v-if="props.clearable && model"
        square
        size="s"
        plain
        @click.prevent="clear"
      >
        <Icon name="ph:x" />
      </Button>
    </Flex>
  </Flex>

  <!-- Inline: label alongside -->
  <Flex v-else expand y-center gap="xs" class="color-picker__inline">
    <Color v-model="model" />
    <span v-if="props.label" class="color-picker__inline-label">{{ props.label }}</span>
    <div class="flex-1" />
    <Button
      v-if="props.clearable"
      square
      size="s"
      plain
      @click.prevent="clear"
    >
      <Icon name="ph:arrow-clockwise" />
    </Button>
  </Flex>
</template>

<style scoped lang="scss">
:deep(.vui-input-container) {
  width: 120px;

  input {
    font-family: monospace;
    font-size: 1.4rem;
  }
}
.color-picker__label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
}

.color-picker__inline {
  padding: var(--space-xxs);
  border-radius: var(--border-radius-s);
  transition: background-color var(--transition);

  &:hover {
    background-color: var(--color-bg-raised);
  }
}

.color-picker__inline-label {
  font-size: var(--font-size-m);
}
</style>
