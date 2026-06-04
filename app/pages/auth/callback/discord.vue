<script setup lang="ts">
import { Button, Card, Flex, Spinner } from '@dolanske/vui'

import '@/assets/elements/auth.scss'

const supabase = useSupabaseClient()
const route = useRoute()

const status = ref<'loading' | 'success' | 'error'>('loading')
const errorMessage = ref('')

// PKCE failures surface as "code verifier not found in storage". These are
// recoverable: the user is already authenticated (linking requires it), so we
// can still try to sync via the service-role edge function before giving up.
const PKCE_ERROR_RE = /code verifier/i
const LINK_SESSION_EXPIRED_MESSAGE = 'Your Discord connection session expired or was started in a different browser. Please return to Settings and try connecting again.'
const LINK_ALREADY_USED_MESSAGE = 'That Discord account is already linked to another profile.'
const GENERIC_LINK_ERROR_MESSAGE = 'Failed to connect Discord account.'

const redirectTarget = computed(() => {
  const redirectParam = route.query.redirect
  if (typeof redirectParam === 'string' && redirectParam.startsWith('/'))
    return redirectParam
  return '/profile/settings'
})

function errorMessageOf(error: unknown): string {
  if (error instanceof Error)
    return error.message
  if (typeof error === 'string')
    return error
  return ''
}

function isRecoverablePkceError(error: unknown): boolean {
  return PKCE_ERROR_RE.test(errorMessageOf(error))
}

function friendlyLinkError(error: unknown): string {
  const message = errorMessageOf(error)
  if (PKCE_ERROR_RE.test(message))
    return LINK_SESSION_EXPIRED_MESSAGE
  if (/already linked|duplicate|23505/i.test(message))
    return LINK_ALREADY_USED_MESSAGE
  return message || GENERIC_LINK_ERROR_MESSAGE
}

// Persist the Discord id through the service-role edge function rather than a
// direct profiles update. The direct update is bound by RLS (including the
// is_aal2_if_mfa() AAL2 requirement), so MFA-enrolled users on an aal1 session
// could not complete linking; the edge function bypasses RLS safely.
async function syncDiscordId(): Promise<'linked' | 'not-linked'> {
  const { data, error } = await supabase.functions.invoke('user-link-discord')
  if (error)
    throw error

  if (data?.success)
    return 'linked'

  if (data?.error === 'Discord identity not linked')
    return 'not-linked'

  throw new Error(friendlyLinkError(data?.error))
}

async function finishLinking() {
  if (typeof window === 'undefined')
    return

  try {
    try {
      await resolveOAuthSession()
    }
    catch (sessionError) {
      // A failed PKCE exchange does not necessarily mean linking is impossible:
      // the identity may already be attached from a prior attempt. Defer the
      // verdict to syncDiscordId() and only re-throw unrecoverable errors.
      if (!isRecoverablePkceError(sessionError))
        throw sessionError
    }

    cleanOAuthParams()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError)
      throw userError
    if (!user)
      throw new Error('No active session found. Please sign in and try linking Discord again.')

    const result = await syncDiscordId()
    if (result === 'not-linked')
      throw new Error(LINK_SESSION_EXPIRED_MESSAGE)

    status.value = 'success'

    setTimeout(() => {
      navigateTo(redirectTarget.value)
    }, 1500)
  }
  catch (err) {
    console.error('Discord link callback error:', err)
    status.value = 'error'
    errorMessage.value = friendlyLinkError(err)
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
  }

  // No callback params. The user may already be linked from a prior attempt;
  // let syncDiscordId() make the final determination instead of hard-failing.
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
          <NuxtLink to="/profile/settings">
            <Button variant="fill">
              Return to Settings
            </Button>
          </NuxtLink>
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
