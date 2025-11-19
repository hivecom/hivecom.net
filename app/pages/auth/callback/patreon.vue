<script setup lang="ts">
import { Button } from '@dolanske/vui'

// Set up the loading state for our spinner
const isLoading = ref(true)
const error = ref('')
const success = ref(false)

// Get runtime config for Supabase URL if needed
const route = useRoute()

// Extract code and state from URL query parameters and ensure code is properly trimmed
const code = typeof route.query.code === 'string' ? route.query.code.trim() : ''
const stateStr = typeof route.query.state === 'string' ? route.query.state : ''
let state: { redirectTo?: string } = {}

// Parse the state JSON if it exists
if (stateStr) {
  try {
    state = JSON.parse(stateStr)
  }
  catch (err) {
    console.error('Failed to parse state:', err)
    error.value = 'Invalid state parameter'
    isLoading.value = false
  }
}

// Make the API call to our Supabase function on component mount
onMounted(async () => {
  if (!code) {
    error.value = 'No authorization code provided'
    isLoading.value = false
    return
  }

  try {
    const supabase = useSupabaseClient()

    // Get the current user to ensure they're logged in
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      error.value = 'You must be logged in to connect Patreon'
      isLoading.value = false
      return
    }

    // Call the Supabase function to process the OAuth
    const { data, error: fnError } = await supabase.functions.invoke('oauth-patreon', {
      body: {
        code,
        redirectUri: `${window.location.origin}/auth/callback/patreon`,
        userId: user.id,
      },
    })

    if (fnError) {
      console.error('Supabase function error:', fnError)
      throw new Error(fnError.message || 'Failed to connect to Patreon service')
    }

    if (data.error) {
      console.error('Patreon OAuth error:', data.error)
      throw new Error(data.error)
    }

    success.value = true

    // Redirect to the specified location or default to profile
    setTimeout(() => {
      navigateTo(state.redirectTo || '/profile')
    }, 1500)
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'An unknown error occurred'
    console.error('Error processing Patreon callback:', err)
    isLoading.value = false
  }
})
</script>

<template>
  <div class="patreon-callback">
    <div v-if="isLoading && !error" class="callback-container">
      <Loading />
      <h2>Connecting your Patreon account</h2>
      <p>Please wait while we link your account...</p>
    </div>

    <div v-else-if="success" class="callback-container success">
      <Icon name="mdi:check-circle" size="48" />
      <h2>Successfully connected!</h2>
      <p>Your Patreon account has been linked to your Hivecom profile.</p>
      <p>Redirecting you back...</p>
    </div>

    <div v-else class="callback-container error">
      <Icon name="mdi:alert-circle" size="48" />
      <h2>Connection failed</h2>
      <p>{{ error }}</p>
      <Button variant="fill" @click="navigateTo('/profile')">
        Return to Profile
      </Button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.patreon-callback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 50vh;
  padding: 2rem;
}

.callback-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 500px;
}

.callback-container h2 {
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}

.callback-container p {
  margin-bottom: 1rem;
  color: var(--text-color);
}

.success {
  color: var(--text-color-green);
}

.error {
  color: var(--text-color-red);
}
</style>
