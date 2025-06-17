<script setup lang="ts">
import { useLastSeenTracking } from '~/utils/lastSeen'

const route = useRoute()

// Initialize last seen tracking for authenticated users
useLastSeenTracking()
</script>

<template>
  <NuxtLoadingIndicator />

  <NuxtLayout :name="route.path.startsWith('/admin') ? 'admin' : 'default'">
    <NuxtPage />
  </NuxtLayout>

  <LayoutLoading />
</template>
