<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const user = useSupabaseUser()

watch(user, () => {
  if (user.value) {
    // TODO: Redirect to protected page
    return navigateTo('/')
  }
}, { immediate: true })
</script>

<template>
  <div>Waiting for login...</div>
</template>
