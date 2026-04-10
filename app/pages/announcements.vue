<script setup lang="ts">
const router = useRouter()

// /announcements was removed - the announcements forum topic is the replacement.
// Redirect immediately so old links and cached crawl results resolve cleanly.
onBeforeMount(() => {
  void router.replace('/forum?activeTopic=announcements')
})
</script>

<template>
  <div />
</template>
