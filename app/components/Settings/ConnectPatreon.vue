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

function getRedirectUri() {
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000/auth/callback/patreon'
  }

  if (process.client && window?.location?.origin) {
    return `${window.location.origin}/auth/callback/patreon`
  }

  // SSR fallback: the public runtime config if available
  const baseUrl = runtimeConfig.public.baseUrl || 'https://hivecom.net'
  return `${baseUrl}/auth/callback/patreon`
}

async function connectPatreon() {
  isConnecting.value = true
  error.value = ''

  try {
    const state = JSON.stringify({ redirectTo: '/profile' })

    const redirectUri = getRedirectUri()

    const authorizeUrl = `https://www.patreon.com/oauth2/authorize?client_id=${runtimeConfig.public.patreonClientId || ''}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`

    if (process.client) {
      window.location.href = authorizeUrl
    }
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'An unknown error occurred'
    console.error('Error initiating Patreon connection:', err)
    isConnecting.value = false

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
