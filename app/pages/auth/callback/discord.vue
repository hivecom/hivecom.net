<script setup lang="ts">
import { Button, Card, Flex, Spinner } from '@dolanske/vui'

import '@/assets/elements/auth.scss'

const supabase = useSupabaseClient()
const route = useRoute()

const status = ref<'loading' | 'success' | 'error'>('loading')
const errorMessage = ref('')

const redirectTarget = computed(() => {
  const redirectParam = route.query.redirect
  if (typeof redirectParam === 'string' && redirectParam.startsWith('/'))
    return redirectParam
  return '/profile/settings'
})

async function finishLinking() {
  if (typeof window === 'undefined')
    return

  try {
    await resolveOAuthSession()

    cleanOAuthParams()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError)
      throw userError
    if (!user)
      throw new Error('No active session found after Discord sign-in.')

    const discordIdentity = user.identities?.find(identity => identity.provider === 'discord')
    if (!discordIdentity)
      throw new Error('Discord identity not found in session.')

    const identityData = discordIdentity.identity_data as Record<string, unknown> | null
    const getField = (key: string) => {
      const value = identityData?.[key]
      return typeof value === 'string' ? value : undefined
    }

    const discordId = getField('id')
      || getField('user_id')
      || getField('sub')
      || getField('provider_id')

    if (!discordId)
      throw new Error('Unable to determine Discord user ID.')

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ discord_id: discordId })
      .eq('id', user.id)

    if (updateError) {
      if (updateError.code === '23505') {
        throw new Error('That Discord account is already linked to another profile.')
      }
      throw updateError
    }

    status.value = 'success'

    setTimeout(() => {
      navigateTo(redirectTarget.value)
    }, 1500)
  }
  catch (err) {
    console.error('Discord link callback error:', err)
    status.value = 'error'
    errorMessage.value = err instanceof Error ? err.message : 'Failed to connect Discord account.'
  }
}

onMounted(() => {
  finishLinking()
})

function cleanOAuthParams() {
  if (typeof window === 'undefined')
    return

  const url = new URL(window.location.href)
  const paramsToClear: Array<'code' | 'state' | 'scope'> = ['code', 'state', 'scope']
  paramsToClear.forEach(param => url.searchParams.delete(param))
  url.hash = ''

  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`)
}

interface FragmentSessionTokens {
  access_token: string
  refresh_token: string
}

async function resolveOAuthSession() {
  if (typeof window === 'undefined')
    throw new Error('OAuth session resolution requires a browser context.')

  const { href, hash } = window.location
  const url = new URL(href)
  const hasCode = url.searchParams.has('code')
  const fragmentSession = parseFragmentSession(hash)

  if (hasCode) {
    const { error } = await supabase.auth.exchangeCodeForSession(href)
    if (error)
      throw error
    return
  }

  if (fragmentSession) {
    const { access_token: accessToken, refresh_token: refreshToken } = fragmentSession
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (error)
      throw error
    return
  }

  throw new Error('Missing OAuth callback parameters. Please restart the Discord link.')
}

function parseFragmentSession(fragment: string): FragmentSessionTokens | null {
  if (!fragment?.startsWith('#'))
    return null

  const params = new URLSearchParams(fragment.slice(1))
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')

  if (!accessToken || !refreshToken)
    return null

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
  }
}
</script>

<template>
  <Flex y-center x-center class="flex-1 w-100 discord-callback" column>
    <Card class="callback-card" separators>
      <Flex column gap="m" x-center y-center class="py-xl text-center">
        <template v-if="status === 'loading'">
          <Spinner size="l" />
          <div>
            <h3>Connecting your Discord account</h3>
            <p class="text-color-light">
              Please wait while we link your profile.
            </p>
          </div>
        </template>

        <template v-else-if="status === 'success'">
          <Icon name="mdi:check-circle" size="48" class="status-icon success" />
          <div>
            <h3>Discord connected!</h3>
            <p class="text-color-light">
              Your Discord account has been linked successfully. Redirecting you shortly.
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
          <Button variant="fill" @click="navigateTo('/profile/settings')">
            Return to Settings
          </Button>
        </template>
      </Flex>
    </Card>
  </Flex>
</template>

<style scoped lang="scss">
.discord-callback {
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
