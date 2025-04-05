<template>
  <NuxtLink to="/">
    <NuxtImg src="/logo.svg" alt="Hivecom" class="logo" />
  </NuxtLink>
</template>

<style scoped lang="scss">
.logo {
  margin-bottom: -1px; // The logo has a pixel gap at the bottom, this fixes it
}

:root.light {
  .logo {
    filter: invert(1) hue-rotate(180deg) brightness(1.8);
  }
}
</style>
