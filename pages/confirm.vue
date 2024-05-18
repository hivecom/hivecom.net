<script setup lang="ts">
const user = useSupabaseUser()

watch(user, () => {
  if (user.value) {
    // Redirect to protected page
    return navigateTo('/test')
  }
}, { immediate: true })
</script>

<template>
  <div>Waiting for login...</div>
</template>
