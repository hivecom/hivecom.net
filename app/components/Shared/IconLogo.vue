<template>
  <NuxtLink to="/" aria-label="Hivecom home">
    <NuxtImg src="/icon.svg" alt="Hivecom" class="icon" decoding="async" />
  </NuxtLink>
</template>

<style scoped lang="scss">
.icon {
  width: 36px;
  display: block;
}

:root.light {
  .icon {
    filter: invert(1) hue-rotate(161deg) brightness(2.25);
  }
}
</style>
