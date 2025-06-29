<script setup lang="ts">
import { Spinner } from '@dolanske/vui'
import ProfileDetail from '~/components/Profile/ProfileDetail.vue'

const route = useRoute()
const user = useSupabaseUser()
const client = useSupabaseClient()
const identifier = route.params.id as string

const loading = ref(true)

// UUID regex pattern to detect if the identifier is a UUID
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Determine if the identifier is a UUID or username
const isUuid = uuidRegex.test(identifier)
const userId = isUuid ? identifier : undefined
const username = !isUuid ? identifier : undefined

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
      <div>Please sign in to view profiles.</div>
    </template>

    <template v-else>
      <ProfileDetail
        :user-id="userId"
        :username="username"
      />
    </template>
  </div>
</template>
