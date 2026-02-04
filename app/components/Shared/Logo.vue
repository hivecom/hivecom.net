<script lang="ts" setup>
const props = defineProps<{ compact?: boolean }>()
</script>

<template>
  <NuxtLink to="/" aria-label="Go to homepage">
    <img :src="props.compact ? '/icon.svg' : '/logo.svg'" alt="Hivecom" class="logo" :class="{ compact: props.compact }">
  </NuxtLink>
</template>

<style scoped lang="scss">
.logo {
  width: 152px;
  margin-bottom: -3px; // The logo has a pixel gap at the bottom, this fixes it

  &.compact {
    margin-bottom: 0;
    width: 40px;
  }
}

:root.light {
  .logo {
    filter: invert(1) hue-rotate(161deg) brightness(2.25);
  }
}
</style>
