<script setup lang="ts">
import { Spinner } from '@dolanske/vui'
import ProfileDetail from '@/components/Profile/ProfileDetail.vue'

import { useSessionReady } from '@/composables/useSessionReady'

const user = useSupabaseUser()
const userId = useUserId()
const client = useSupabaseClient()
const { navigateToSignIn } = useAuthRedirect()
const { waitForSessionReady } = useSessionReady()

const loading = ref(true)

onMounted(async () => {
  await waitForSessionReady()

  if (!user.value) {
    navigateToSignIn()
    return
  }

  // Set up auth state change listener
  const authListener = client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      navigateToSignIn()
    }
  })

  onUnmounted(() => {
    authListener.data.subscription.unsubscribe()
  })

  loading.value = false
})
</script>

<template>
  <div class="page container-l">
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
