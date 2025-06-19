<script setup lang="ts">
import { Spinner } from '@dolanske/vui'
import ProfileView from '@/components/Profile/ProfileView.vue'

const user = useSupabaseUser()
const client = useSupabaseClient()

const loading = ref(true)

// Add ready state to track when auth is fully initialized
const authReady = ref(false)

onMounted(() => {
  const authListener = client.auth.onAuthStateChange((event, _session) => {
    authReady.value = true
    loading.value = false

    if (event === 'SIGNED_OUT') {
      navigateTo('/auth/sign-in')
    }
  })

  // Cleanup listener on component unmount
  onUnmounted(() => {
    authListener.data.subscription.unsubscribe()
  })

  // Try to determine auth state immediately if user is already available
  if (user.value) {
    loading.value = false
    authReady.value = true
  }
  else {
    // Set a timeout to check if we're still loading after a reasonable time
    setTimeout(() => {
      if (loading.value && !user.value && authReady.value) {
        navigateTo('/auth/sign-in')
      }
      loading.value = false
    }, 1000)
  }
})

// Watch for user changes
watch(user, (newUser) => {
  if (!newUser && authReady.value) {
    navigateTo('/auth/sign-in')
  }
})
</script>

<template>
  <div class="page">
    <template v-if="loading">
      <Spinner size="l" />
    </template>

    <template v-else-if="!user">
      <div>Please sign in to view your profile.</div>
    </template>

    <template v-else>
      <ProfileView :user-id="user.id" />
    </template>
  </div>
</template>
