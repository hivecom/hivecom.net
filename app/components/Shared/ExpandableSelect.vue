<script setup lang="ts">
import type { SelectOption } from '@dolanske/vui'
import { Select } from '@dolanske/vui'

// Drop-in replacement for VUI's `Select` that actually supports `expand`.
//
// VUI's `Select` has no `expand` prop (unlike `Input`/`Button`). Passing one is
// a no-op, and adding `.w-100` only stretches the outer `.vui-select` container
// while the trigger `<button>` stays content-width. This wrapper forwards every
// Select prop/event via `$attrs`/`v-model` and, when `expand` is set, forces the
// whole trigger chain (container + content + button) to fill its parent.

defineOptions({ inheritAttrs: false })

defineProps<{
  options: SelectOption[]
  expand?: boolean
}>()

const model = defineModel<SelectOption[]>()
</script>

<template>
  <Select
    v-bind="$attrs"
    v-model="model"
    :options="options"
    :class="{ 'expandable-select--expand': expand }"
  />
</template>

<style scoped lang="scss">
.expandable-select--expand {
  width: 100%;

  // Stretch the inner trigger; VUI sets no width on these, so no specificity
  // battle is needed beyond the scoped attribute selector.
  :deep(.vui-select-trigger-content),
  :deep(.vui-select-trigger-container) {
    width: 100%;
  }
}
</style>
