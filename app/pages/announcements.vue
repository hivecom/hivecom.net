<script setup lang="ts">
const router = useRouter()

// The announcements forum topic replaces this page. Redirect so old links and
// cached crawl results resolve.
onBeforeMount(() => {
  void router.replace('/forum?activeTopic=announcements')
})
</script>

<template>
  <div />
</template>
