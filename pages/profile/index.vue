<script setup lang="ts">
import { Spinner } from '@dolanske/vui'
import ProfileView from '@/components/Profile/ProfileView.vue'

const user = useSupabaseUser()
const client = useSupabaseClient()

const loading = ref(true)

onMounted(async () => {
  // First, wait for the initial session to be determined
  const { data: { session } } = await client.auth.getSession()

  // Set up auth state change listener
  const authListener = client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      navigateTo('/auth/sign-in')
    }
  })

  // Cleanup listener on component unmount
  onUnmounted(() => {
    authListener.data.subscription.unsubscribe()
  })

  // Check initial auth state
  if (!session) {
    navigateTo('/auth/sign-in')
    return
  }

  loading.value = false
})

// Watch for user changes and redirect if signed out
watch(user, (newUser) => {
  if (!newUser && !loading.value) {
    navigateTo('/auth/sign-in')
  }
}, { immediate: true })
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
