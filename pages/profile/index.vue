<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Card, Flex, Spinner } from '@dolanske/vui'
import ConnectPatreon from '~/components/Profile/ConnectPatreon.vue'
import ErrorAlert from '~/components/Shared/ErrorAlert.vue'

const user = useSupabaseUser()
const client = useSupabaseClient()
const profile = ref<Tables<'profiles'>>()

const supabase = useSupabaseClient()

const loading = ref(true)
const errorMessage = ref('')

// Add ready state to track when auth is fully initialized
const authReady = ref(false)

async function fetchProfile() {
  loading.value = true

  if (!user.value) {
    navigateTo('/auth/sign-in')
    return
  }

  const requestProfile = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.value.id)
    .single()

  if (requestProfile.error) {
    errorMessage.value = requestProfile.error.message
    loading.value = false
    return
  }

  profile.value = requestProfile.data
  loading.value = false
}

onMounted(() => {
  const authListener = client.auth.onAuthStateChange((event, session) => {
    authReady.value = true

    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
      if (session) {
        fetchProfile()
      }
    }
    else if (event === 'SIGNED_OUT') {
      navigateTo('/auth/sign-in')
    }
  })

  // Cleanup listener on component unmount
  onUnmounted(() => {
    authListener.data.subscription.unsubscribe()
  })

  // Try to fetch profile immediately if user is already available
  // This helps when navigating directly to the page
  if (user.value) {
    fetchProfile()
  }
  else {
    // Set a timeout to check if we're still loading after a reasonable time
    setTimeout(() => {
      if (loading.value && !user.value && authReady.value) {
        navigateTo('/auth/sign-in')
      }
    }, 1000)
  }
})

// Still keep the watch for other scenarios
watch(user, (newUser) => {
  if (newUser && authReady.value) {
    fetchProfile()
  }
})
</script>

<template>
  <div class="page">
    <template v-if="loading">
      <Spinner size="l" />
    </template>

    <template v-else>
      <div v-if="!loading && errorMessage">
        <ErrorAlert :message="errorMessage" />
      </div>

      <div v-if="!profile">
        <ErrorAlert message="No profile found." />
      </div>

      <Flex v-else column gap="s">
        <h1>{{ profile.username }}</h1>
        <Flex expand gap="s">
          <Card class="w-100">
            <template #header>
              <h2>
                {{ profile.title }}
              </h2>
            </template>
            <h5>{{ profile.subtitle }}</h5>
          </Card>

          <Card class="w-full">
            <template #header>
              <h5>Connected Accounts</h5>
            </template>
            <Flex column gap="s">
              <Flex expand y-center x-between gap="s">
                <strong>Patreon</strong>
                <span v-if="profile.patreon_id">Connected ({{ profile.patreon_id }})</span>
                <ConnectPatreon v-else />
              </Flex>
            </Flex>
          </Card>
        </Flex>
      </Flex>
    </template>
  </div>
</template>

<style scoped>
.error-container,
.loading-container {
  display: flex;
  justify-content: center;
  padding: 2rem;
}
</style>
