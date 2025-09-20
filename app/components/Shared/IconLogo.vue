<template>
  <NuxtLink to="/">
    <NuxtImg src="/icon.svg" alt="Hivecom" class="icon" />
  </NuxtLink>
</template>

<style scoped lang="scss">
.icon {
  width: 36px;
}

:root.light {
  .logo {
    filter: invert(1) hue-rotate(161deg) brightness(2.25);
  }
}
</style>
