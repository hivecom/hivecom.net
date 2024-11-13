<script setup lang="ts">
// import '@dolanske/vui/style'
</script>

<template>
  <NuxtLoadingIndicator />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<style lang="scss">
// Import vui library globally
@use '@dolanske/vui/style';

// Override anything with our homegrown styles
@use "~/assets/index.scss";
</style>
