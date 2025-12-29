<script setup lang="ts">
import { Button, Card, Flex, Spinner } from '@dolanske/vui'

const supabase = useSupabaseClient()
const route = useRoute()

const status = ref<'loading' | 'success' | 'error'>('loading')
const errorMessage = ref('')
const parsedRedirect = ref('/profile/settings')

const errorMessages: Record<string, string> = {
  cancelled: 'Steam authentication was cancelled.',
  verification_failed: 'Unable to verify Steam authentication. Please try again.',
  invalid_steam_id: 'Unable to retrieve your Steam ID. Please try again.',
  already_linked: 'This Steam account is already linked to another profile.',
  not_authenticated: 'You must be signed in to link your Steam account.',
}

async function handleCallback() {
  if (typeof window === 'undefined')
    return

  // Parse state from query params (contains mode and redirect)
  const stateParam = route.query.state as string
  let mode = 'link'
  let redirect = '/profile/settings'

  if (stateParam) {
    try {
      const state = JSON.parse(atob(stateParam))
      mode = state.mode || 'link'
      redirect = state.redirect || '/profile/settings'
      parsedRedirect.value = redirect
    }
    catch {
      // Invalid state, use defaults
    }
  }

  // Check if user cancelled (openid.mode will be 'cancel')
  if (route.query['openid.mode'] === 'cancel') {
    status.value = 'error'
    errorMessage.value = 'Steam authentication was cancelled.'
    return
  }

  // Check if we have OpenID params from Steam
  const claimedId = route.query['openid.claimed_id'] as string
  if (!claimedId) {
    status.value = 'error'
    errorMessage.value = 'Missing Steam authentication response.'
    return
  }

  // Collect all OpenID params
  const openIdParams: Record<string, string> = {}
  for (const [key, value] of Object.entries(route.query)) {
    if (key.startsWith('openid.') && typeof value === 'string') {
      openIdParams[key] = value
    }
  }

  // Verify with Edge Function
  try {
    const { data, error } = await supabase.functions.invoke('openid-steam-verify', {
      body: {
        openIdParams,
        mode,
      },
    })

    if (error)
      throw error

    if (!data?.success) {
      const errorCode = data?.error || 'verification_failed'
      status.value = 'error'
      errorMessage.value = errorMessages[errorCode] || errorCode
      return
    }

    // Clean URL
    cleanCallbackParams()

    // Link was successful (done in Edge Function)
    status.value = 'success'

    setTimeout(() => {
      navigateTo(parsedRedirect.value)
    }, 1500)
  }
  catch (err) {
    console.error('Steam callback error:', err)
    status.value = 'error'
    errorMessage.value = err instanceof Error ? err.message : 'Failed to verify Steam authentication.'
  }
}

function cleanCallbackParams() {
  if (typeof window === 'undefined')
    return

  const url = new URL(window.location.href)
  // Clear all openid params and state
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('openid.') || key === 'state') {
      url.searchParams.delete(key)
    }
  }

  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`)
}

onMounted(() => {
  handleCallback()
})
</script>

<template>
  <Flex y-center x-center class="flex-1 w-100 steam-callback" column>
    <Card class="callback-card" separators>
      <Flex column gap="m" x-center y-center class="py-xl text-center">
        <template v-if="status === 'loading'">
          <Spinner size="l" />
          <div>
            <h3>Connecting your Steam account</h3>
            <p class="text-color-light">
              Please wait while we process your request.
            </p>
          </div>
        </template>

        <template v-else-if="status === 'success'">
          <Icon name="mdi:check-circle" size="48" class="status-icon success" />
          <div>
            <h3>Steam connected!</h3>
            <p class="text-color-light">
              Your Steam account has been linked successfully. Redirecting you shortly.
            </p>
          </div>
        </template>

        <template v-else>
          <Icon name="mdi:alert-circle" size="48" class="status-icon error" />
          <div>
            <h3>Connection failed</h3>
            <p class="text-color-light">
              {{ errorMessage }}
            </p>
          </div>
          <Flex gap="s" wrap>
            <Button variant="gray" @click="navigateTo('/auth/sign-in')">
              Sign In
            </Button>
            <Button variant="fill" @click="navigateTo('/profile/settings')">
              Go to Settings
            </Button>
          </Flex>
        </template>
      </Flex>
    </Card>
  </Flex>
</template>

<style scoped lang="scss">
.steam-callback {
  min-height: 60vh;
  padding: var(--space-xl);
}

.callback-card {
  width: min(480px, 100%);
}

.status-icon.success {
  color: var(--color-text-green);
}

.status-icon.error {
  color: var(--color-text-red);
}

.mt-m {
  margin-top: var(--space-m);
}
</style>
