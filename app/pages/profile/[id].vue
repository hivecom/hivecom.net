<script setup lang="ts">
import { Spinner } from '@dolanske/vui'
import ProfileDetail from '@/components/Profile/ProfileDetail.vue'

const route = useRoute()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { navigateToSignIn } = useAuthRedirect()
const identifier = route.params.id as string

const loading = ref(true)
const isPublicProfile = ref<boolean | null>(null)

// UUID regex pattern to detect if the identifier is a UUID
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Determine if the identifier is a UUID or username
const isUuid = uuidRegex.test(identifier)
const userId = isUuid ? identifier : undefined
const username = !isUuid ? identifier : undefined

onMounted(async () => {
  // Resolve session first
  const { data: { session } } = await client.auth.getSession()

  // Fetch just the public field of the profile to decide access
  let profilePublic: boolean | null = null

  if (isUuid) {
    const { data } = await client
      .from('profiles')
      .select('public')
      .eq('id', identifier)
      .maybeSingle()
    profilePublic = data?.public ?? null
  }
  else {
    const { data } = await client
      .from('profiles')
      .select('public')
      .ilike('username', identifier)
      .maybeSingle()
    profilePublic = data?.public ?? null
  }

  isPublicProfile.value = profilePublic

  // If the profile is private and the user is not signed in, redirect to sign-in
  if (!session && !profilePublic) {
    navigateToSignIn()
    return
  }

  // Only attach the sign-out redirect listener for authenticated sessions
  if (session) {
    const authListener = client.auth.onAuthStateChange((event, newSession) => {
      // If the user signs out while viewing a private profile, redirect them away
      if ((event === 'SIGNED_OUT' || !newSession) && !isPublicProfile.value) {
        navigateToSignIn()
      }
    })

    onUnmounted(() => {
      authListener.data.subscription.unsubscribe()
    })
  }

  loading.value = false
})
</script>

<template>
  <div class="page">
    <template v-if="loading">
      <Spinner size="l" />
    </template>

    <template v-else-if="!user && !isPublicProfile">
      <div>Please sign in to view this profile.</div>
    </template>

    <template v-else>
      <ProfileDetail
        :user-id="userId"
        :username="username"
      />
    </template>
  </div>
</template>
