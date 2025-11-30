<template>
  <NuxtLink to="/" aria-label="Go to homepage">
    <img src="/logo.svg" alt="Hivecom" class="logo">
  </NuxtLink>
</template>

<style scoped lang="scss">
.logo {
  width: 152px;
  margin-bottom: -3px; // The logo has a pixel gap at the bottom, this fixes it
}

:root.light {
  .logo {
    filter: invert(1) hue-rotate(161deg) brightness(2.25);
  }
}
</style>
