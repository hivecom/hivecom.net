<script setup lang="ts">
import { useLastSeenTracking } from '~/utils/lastSeen'

const route = useRoute()

// Initialize last seen tracking for authenticated users
useLastSeenTracking()
</script>

<template>
  <NuxtLoadingIndicator color="#88ff22" />

  <NuxtLayout :name="route.path.startsWith('/admin') ? 'admin' : 'default'">
    <NuxtPage />
  </NuxtLayout>

  <LayoutLoading />
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: all 0.1s linear;
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
}
</style>
