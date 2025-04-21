<script setup lang="ts">
const route = useRoute()
</script>

<template>
  <NuxtLoadingIndicator />

  <NuxtLayout :name="route.path.startsWith('/admin') ? 'admin' : 'default'">
    <NuxtPage />
  </NuxtLayout>

  <LayoutLoading />
</template>
