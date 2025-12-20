<script setup lang="ts">
const route = useRoute()
const id = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id

await navigateTo(
  {
    path: `/servers/gameservers/${id}`,
    query: route.query,
  },
  { redirectCode: 301 },
)
</script>

<template>
  <div />
</template>
