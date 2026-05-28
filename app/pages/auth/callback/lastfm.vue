<script setup lang="ts">
import { Button, Card, Flex, Spinner } from '@dolanske/vui'
import { useSessionReady } from '@/composables/useSessionReady'

const { waitForSessionReady } = useSessionReady()

const supabase = useSupabaseClient()
const route = useRoute()

const status = ref<'loading' | 'success' | 'error'>('loading')
const errorMessage = ref('')
const parsedRedirect = ref('/profile/settings')

const errorMessages = {
  verification_failed: 'Unable to verify Last.fm authentication. Please try again.',
  already_linked: 'This Last.fm account is already linked to another profile.',
  not_authenticated: 'You must be signed in to link your Last.fm account.',
  missing_token: 'Missing Last.fm authentication token.',
} as const

function getErrorMessage(code: string): string {
  return (errorMessages as Record<string, string>)[code] ?? code
}

async function handleCallback() {
  if (typeof window === 'undefined')
    return

  const stateParam = route.query.state as string
  let redirect = '/profile/settings'

  if (stateParam) {
    try {
      const decoded = atob(stateParam)
      const state = JSON.parse(decoded) as { redirect?: string }
      redirect = state.redirect || '/profile/settings'
      parsedRedirect.value = redirect
    }
    catch {
      // Invalid state, use defaults
    }
  }

  const tokenRaw = route.query.token

  if (typeof tokenRaw !== 'string' || !tokenRaw) {
    status.value = 'error'
    errorMessage.value = errorMessages.missing_token as string
    return
  }

  const token: string = tokenRaw

  await waitForSessionReady()

  try {
    const { data, error } = await supabase.functions.invoke('lastfm-verify-confirm', {
      body: { token, state: stateParam ?? null },
    })

    if (error)
      throw error

    if (!data?.success) {
      status.value = 'error'
      errorMessage.value = getErrorMessage((data?.error as string | undefined) ?? 'verification_failed')
      return
    }

    cleanCallbackParams()
    status.value = 'success'

    setTimeout(() => {
      navigateTo(parsedRedirect.value)
    }, 1500)
  }
  catch (err) {
    console.error('Last.fm callback error:', err)
    status.value = 'error'
    errorMessage.value = err instanceof Error ? err.message : 'Failed to verify Last.fm authentication.'
  }
}

function cleanCallbackParams() {
  if (typeof window === 'undefined')
    return

  const url = new URL(window.location.href)
  url.searchParams.delete('token')
  url.searchParams.delete('state')
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`)
}

onMounted(() => {
  void handleCallback()
})
</script>

<template>
  <Flex y-center x-center class="flex-1 w-100 lastfm-callback" column>
    <Card class="callback-card" separators>
      <Flex column gap="m" x-center y-center class="py-xl text-center">
        <template v-if="status === 'loading'">
          <Spinner size="l" />
          <div>
            <h3>Connecting your Last.fm account</h3>
            <p class="text-color-light">
              Please wait while we process your request.
            </p>
          </div>
        </template>

        <template v-else-if="status === 'success'">
          <Icon name="ph:check-circle" size="48" class="status-icon success" />
          <div>
            <h3>Last.fm connected!</h3>
            <p class="text-color-light">
              Your Last.fm account has been linked successfully. Redirecting you shortly.
            </p>
          </div>
        </template>

        <template v-else>
          <Icon name="ph:warning-circle" size="48" class="status-icon error" />
          <div>
            <h3>Connection failed</h3>
            <p class="text-color-light">
              {{ errorMessage }}
            </p>
          </div>
          <NuxtLink to="/profile/settings">
            <Button variant="fill">
              Go to Settings
            </Button>
          </NuxtLink>
        </template>
      </Flex>
    </Card>
  </Flex>
</template>

<style scoped lang="scss">
.lastfm-callback {
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
</style>
