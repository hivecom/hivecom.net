<script setup lang="ts">
defineProps<{ class?: string }>()
</script>

<template>
  <div class="table-scroll-wrapper" :class="$props.class">
    <slot />
  </div>
</template>

<style scoped lang="scss">
.table-scroll-wrapper {
  width: 100%;
}

.table-scroll-wrapper :deep(.vui-table-container) {
  width: 100%;
  overflow-x: auto;
  display: block;
}

.table-scroll-wrapper :deep(.vui-table-container table) {
  min-width: 100%;
}
</style>
