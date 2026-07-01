<script setup lang="ts">
import { Resizable } from '@dolanske/vui'

defineProps<{
  storageKey?: string
}>()
</script>

<template>
  <Resizable vertical :storage-key="storageKey" class="sidebar-split">
    <div class="sidebar-split__panel">
      <slot name="top" />
    </div>
    <div class="sidebar-split__panel">
      <slot name="bottom" />
    </div>
  </Resizable>
</template>

<style lang="scss" scoped>
.sidebar-split {
  flex: 1;
  min-height: 0;
  width: 100%;

  &__panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;

    // Slot content is rendered by the parent so it carries the parent's
    // scoped attribute. :deep() punches through so the rule applies.
    :deep(> *) {
      flex: 1;
      min-height: 0;
    }
  }
}
</style>
