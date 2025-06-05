<script setup lang="ts">
interface Props {
  class?: string
}

defineProps<Props>()
</script>

<template>
  <div class="table-overflow" :class="$props.class">
    <slot />
  </div>
</template>

<style scoped>
.table-overflow {
  display: flex;
  overflow-x: auto;
  max-width: 94vw;
}
</style>
