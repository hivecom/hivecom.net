<script setup lang="ts">
import { Button, Card, Flex, Spinner } from '@dolanske/vui'

import '@/assets/elements/auth.scss'

const route = useRoute()
const supabase = useSupabaseClient()

const status = ref<'loading' | 'success' | 'error'>('loading')
const errorMessage = ref('')

const code = typeof route.query.code === 'string' ? route.query.code.trim() : ''
const stateStr = typeof route.query.state === 'string' ? route.query.state : ''

let redirectTarget = '/profile'

function fail(message: string) {
  errorMessage.value = message
  status.value = 'error'
}

if (stateStr) {
  try {
    const parsed = JSON.parse(stateStr) as { redirectTo?: string }
    if (typeof parsed.redirectTo === 'string' && parsed.redirectTo.startsWith('/'))
      redirectTarget = parsed.redirectTo
  }
  catch (err) {
    console.error('Failed to parse state:', err)
    fail('Invalid state parameter')
  }
}

onMounted(async () => {
  if (status.value === 'error')
    return

  if (!code) {
    fail('No authorization code provided')
    return
  }

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user)
      throw new Error('You must be logged in to connect Patreon')

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

    status.value = 'success'

    setTimeout(() => {
      navigateTo(redirectTarget)
    }, 1500)
  }
  catch (err) {
    console.error('Error processing Patreon callback:', err)
    fail(err instanceof Error ? err.message : 'An unknown error occurred')
  }
})
</script>

<template>
  <Flex y-center x-center class="flex-1 w-100 patreon-callback" column>
    <Card class="callback-card" separators>
      <Flex column gap="m" x-center y-center class="py-xl text-center">
        <template v-if="status === 'loading'">
          <Spinner size="l" />
          <div>
            <h3>Connecting your Patreon account</h3>
            <p class="text-color-light">
              Please wait while we link your account.
            </p>
          </div>
        </template>

        <template v-else-if="status === 'success'">
          <Icon name="mdi:check-circle" size="48" class="status-icon success" />
          <div>
            <h3>Patreon connected!</h3>
            <p class="text-color-light">
              Your Patreon account is now linked to your profile. Redirecting you shortly.
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
          <Button variant="fill" @click="navigateTo('/profile')">
            Return to Profile
          </Button>
        </template>
      </Flex>
    </Card>
  </Flex>
</template>

<style scoped lang="scss">
.patreon-callback {
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
