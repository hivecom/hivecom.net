<script setup lang="ts">
const route = useRoute()

defineOgImageComponent('Event', {
  eventId: route.params.id,
})
</script>

<template>
  <ProfilePageRoot />
</template>
