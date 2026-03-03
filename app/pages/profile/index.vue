<script setup lang="ts">
import { Spinner } from '@dolanske/vui'
import ProfileDetail from '@/components/Profile/ProfileDetail.vue'

const user = useSupabaseUser()
const userId = useUserId()
const client = useSupabaseClient()
const { navigateToSignIn } = useAuthRedirect()

const loading = ref(true)

onMounted(async () => {
  // First, wait for the initial session to be determined
  const { data: { session } } = await client.auth.getSession()

  // Set up auth state change listener
  const authListener = client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      navigateToSignIn()
    }
  })

  // Cleanup listener on component unmount
  onUnmounted(() => {
    authListener.data.subscription.unsubscribe()
  })

  // Check initial auth state
  if (!session) {
    navigateToSignIn()
    return
  }

  loading.value = false
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
      <ProfileDetail :user-id="userId ?? undefined" />
    </template>
  </div>
</template>
