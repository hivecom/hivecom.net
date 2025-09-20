<script setup lang="ts">
import { useLastSeenTracking } from '@/lib/utils/lastSeen'

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
/* Custom page transitions that work better with data fetching */
.page-enter-active {
  transition: all 0.2s ease-out;
  transition-delay: 0.2s; /* Delay entry to ensure old page has unmounted */
}

.page-leave-active {
  transition: all 0.15s ease-in;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

.page-enter-to,
.page-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
