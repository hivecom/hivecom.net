<script setup lang="ts">
defineProps<{ class?: string }>()
</script>

<template>
  <div class="table-scroll-wrapper" :class="$props.class">
    <slot />
  </div>
</template>

<style lang="scss">
.table-scroll-wrapper {
  width: 100%;
}

.table-scroll-wrapper .vui-table-container {
  width: 100%;
  overflow-x: auto;
  display: block;
  position: relative;
}

.table-scroll-wrapper .vui-table-container .vui-table-pagination-wrap {
  position: sticky;
  left: 0;
}

.table-scroll-wrapper .vui-table-container table {
  min-width: 100%;
}
</style>
