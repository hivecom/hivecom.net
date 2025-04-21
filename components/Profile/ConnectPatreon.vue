<script setup lang="ts">
import { Button } from '@dolanske/vui'

const runtimeConfig = useRuntimeConfig()

const isConnecting = ref(false)
const error = ref('')

// Determine the redirect URI - use current origin for production
const redirectUri = process.env.NODE_ENV === 'development'
  ? 'http://localhost:3000/auth/callback/patreon'
  : `${window.location.origin}/auth/callback/patreon`

async function connectPatreon() {
  isConnecting.value = true
  error.value = ''

  try {
    // State can be used to pass data that will be returned with the callback
    // It's typically used for CSRF protection and to store the redirect destination
    const state = JSON.stringify({ redirectTo: '/profile' })

    // Construct the URL for our Patreon authorization
    const authorizeUrl = `https://www.patreon.com/oauth2/authorize?client_id=${runtimeConfig.public.patreonClientId || ''}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`

    // Redirect the user to Patreon's authorization page
    window.location.href = authorizeUrl
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'An unknown error occurred'
    console.error('Error initiating Patreon connection:', err)
    isConnecting.value = false
  }
}
</script>

<template>
  <div>
    <Button
      variant="fill"
      :loading="isConnecting"
      :disabled="isConnecting"
      @click="connectPatreon"
    >
      <template #icon>
        <Icon name="simple-icons:patreon" />
      </template>
      Connect Patreon
    </Button>
    <p v-if="error" class="error mt-s">
      {{ error }}
    </p>
  </div>
</template>

<style scoped>
.error {
  color: var(--color-text-red);
  font-size: 0.875rem;
}
</style>
