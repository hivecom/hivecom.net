<script setup lang="ts">
const id = useRoute().params.id as string
</script>

<template>
  <div>Profile {{ id }}</div>
</template>
