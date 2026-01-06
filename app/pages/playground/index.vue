<script setup lang="ts">
import UserPreviewCard from '@/components/Shared/UserPreviewCard.vue'

const userId = useUserId()
</script>

<template>
  <div style="padding-top: 128px;">
    <UserPreviewCard :user-id />
  </div>
</template>

<style scoped>

</style>
