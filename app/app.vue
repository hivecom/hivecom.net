<script setup lang="ts">
import { computed } from 'vue'
import { useLastSeenTracking } from '@/lib/lastSeen'

const route = useRoute()
const layoutName = computed(() => {
  if (route.path.startsWith('/admin'))
    return 'admin'

  if (route.path === '/')
    return 'landing'

  return 'default'
})

// Initialize last seen tracking for authenticated users
useLastSeenTracking()
</script>

<template>
  <NuxtLoadingIndicator color="#88ff22" />

  <NuxtLayout :name="layoutName">
    <NuxtPage />
  </NuxtLayout>

  <LayoutLoading />
</template>

<style>
/* Custom page transitions that work better with data fetching */
.page-enter-active {
  transition: all 0.1s linear;
  transition-delay: 0.1s; /* Delay entry to ensure old page has unmounted */
}

.page-leave-active {
  transition: all 0.1s linear;
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
