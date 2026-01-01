<script setup lang="ts">
import { Button, pushToast } from '@dolanske/vui'

import SharedErrorToast from '@/components/Shared/ErrorToast.vue'

const props = withDefaults(defineProps<{ expand?: boolean }>(), {
  expand: false,
})

const runtimeConfig = useRuntimeConfig()

const isConnecting = ref(false)
const error = ref('')

watch(error, (newError) => {
  if (newError)
    pushToast(error.value)
})

// Determine the redirect URI - use current origin for production
function getRedirectUri() {
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000/auth/callback/patreon'
  }

  // Use process.client to ensure we're on client side
  if (process.client && window?.location?.origin) {
    return `${window.location.origin}/auth/callback/patreon`
  }

  // Fallback for SSR - use the public runtime config if available
  const baseUrl = runtimeConfig.public.baseUrl || 'https://hivecom.net'
  return `${baseUrl}/auth/callback/patreon`
}

async function connectPatreon() {
  isConnecting.value = true
  error.value = ''

  try {
    // State can be used to pass data that will be returned with the callback
    // It's typically used for CSRF protection and to store the redirect destination
    const state = JSON.stringify({ redirectTo: '/profile' })

    // Get the redirect URI dynamically
    const redirectUri = getRedirectUri()

    // Construct the URL for our Patreon authorization
    const authorizeUrl = `https://www.patreon.com/oauth2/authorize?client_id=${runtimeConfig.public.patreonClientId || ''}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`

    // Redirect the user to Patreon's authorization page
    if (process.client) {
      window.location.href = authorizeUrl
    }
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'An unknown error occurred'
    console.error('Error initiating Patreon connection:', err)
    isConnecting.value = false

    // Display error in toast
    pushToast('', {
      body: SharedErrorToast,
      bodyProps: {
        error: 'There was an error connecting to Patreon. Please try again.',
      },
    })
  }
}
</script>

<template>
  <div>
    <Button
      variant="fill"
      :expand="props.expand"
      :loading="isConnecting"
      :disabled="isConnecting"
      size="s"
      @click="connectPatreon"
    >
      Connect
    </Button>
  </div>
</template>

<style scoped lang="scss">
</style>
