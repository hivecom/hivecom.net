<script setup lang="ts">
const route = useRoute()

await navigateTo(
  {
    path: '/servers/gameservers',
    query: route.query,
  },
  { redirectCode: 301 },
)
</script>

<template>
  <div />
</template>
