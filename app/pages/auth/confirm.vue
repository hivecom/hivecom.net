<script setup lang="ts">
import type { UserIdentity } from '@supabase/supabase-js'

import { Alert, Button, Card, Flex, Input, Spinner, Switch } from '@dolanske/vui'
import ErrorAlert from '@/components/Shared/ErrorAlert.vue'
import { useSupabaseCache } from '@/composables/useSupabaseCache'

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const userId = useUserId()
const router = useRouter()

const loading = ref(true)
const error = ref('')

const processComplete = ref(false)
const usernameStep = ref(false)
const username = ref('')
const usernameError = ref('')
const usernameLoading = ref(false)
const resolvedDiscordIdentity = ref<UserIdentity | null>(null)
let discordIdentityFetchPromise: Promise<UserIdentity | null> | null = null

const isDev = process.env.NODE_ENV === 'development'
const showDebugPanel = ref(isDev)
const debugOptions = reactive({
  bypassAuth: false,
  forceUsernameStep: false,
  forceSuccess: false,
  forceError: false,
  customError: 'Authentication failed due to an expired token',
  skipRedirect: false,
})

const USERNAME_LIMIT = 32

const cache = useSupabaseCache()
let discordUsernameAttempted = false
let discordIdSyncInFlight = false

function invalidateUserProfileCache() {
  const normalizedId = userId.value?.trim()
  if (!normalizedId)
    return

  cache.delete(`user:profile:${normalizedId}`)
  cache.delete(`user:role:${normalizedId}`)
  cache.delete(`user:avatar:${normalizedId}`)
}

function scheduleProfileRedirect() {
  if (debugOptions.skipRedirect)
    return

  setTimeout(() => {
    navigateTo('/profile')
  }, 1500)
}

function applyDebugOptions() {
  if (!isDev)
    return

  loading.value = false

  if (debugOptions.forceError) {
    error.value = debugOptions.customError
    usernameStep.value = false
    processComplete.value = false
    return
  }

  if (debugOptions.forceSuccess) {
    processComplete.value = true
    usernameStep.value = false
    error.value = ''
    return
  }

  if (debugOptions.forceUsernameStep) {
    usernameStep.value = true
    processComplete.value = false
    error.value = ''
  }
}

function toggleDebugPanel() {
  showDebugPanel.value = !showDebugPanel.value
}

function getDiscordIdentity(): UserIdentity | null {
  if (resolvedDiscordIdentity.value)
    return resolvedDiscordIdentity.value

  const identity = user.value?.identities?.find((candidate: UserIdentity) => candidate.provider === 'discord') ?? null

  if (identity)
    resolvedDiscordIdentity.value = identity

  return identity
}

async function ensureDiscordIdentity(): Promise<UserIdentity | null> {
  if (isDev && debugOptions.bypassAuth)
    return getDiscordIdentity()

  const existing = getDiscordIdentity()
  if (existing || !user.value)
    return existing

  if (discordIdentityFetchPromise)
    return discordIdentityFetchPromise

  discordIdentityFetchPromise = (async () => {
    try {
      const { data, error: userError } = await supabase.auth.getUser()

      if (userError) {
        console.error('Failed to load Supabase user identities:', userError)
        return null
      }

      const freshIdentity = data.user?.identities?.find((candidate: UserIdentity) => candidate.provider === 'discord') ?? null

      if (freshIdentity)
        resolvedDiscordIdentity.value = freshIdentity

      return resolvedDiscordIdentity.value
    }
    catch (fetchError) {
      console.error('Unexpected error while fetching Supabase user identities:', fetchError)
      return null
    }
    finally {
      discordIdentityFetchPromise = null
    }
  })()

  return discordIdentityFetchPromise
}

function extractDiscordId(identity?: UserIdentity | null) {
  if (!identity)
    return null

  const identityData = identity.identity_data as Record<string, unknown> | null
  const getField = (key: string) => {
    const value = identityData?.[key]
    return typeof value === 'string' ? value : undefined
  }

  return getField('id')
    || getField('user_id')
    || getField('sub')
    || getField('provider_id')
    || null
}

function extractDiscordUsername(identity?: UserIdentity | null) {
  if (!identity)
    return null

  const identityData = identity.identity_data as Record<string, unknown> | null
  const candidateKeys = ['global_name', 'username', 'user_name', 'display_name', 'name', 'preferred_username']

  for (const key of candidateKeys) {
    const value = identityData?.[key]
    if (typeof value === 'string' && value.trim().length)
      return value
  }

  return null
}

function sanitizeUsernameCandidate(rawValue: string | null) {
  if (!rawValue)
    return null

  const trimmed = rawValue.trim()
  if (!trimmed)
    return null

  const cleaned = trimmed
    .replace(/\s+/g, '_')
    .replace(/\W+/g, '')
    .slice(0, USERNAME_LIMIT)

  return cleaned.length >= 3 ? cleaned : null
}

function getDiscordUsernameSuggestion() {
  const discordIdentity = getDiscordIdentity()
  return sanitizeUsernameCandidate(extractDiscordUsername(discordIdentity))
}

interface UpdateUsernameResult {
  success: boolean
  message?: string
  code?: string
}

async function updateUsernameValue(newUsername: string): Promise<UpdateUsernameResult> {
  const normalized = newUsername.trim()

  if (normalized.length < 3)
    return { success: false, message: 'Username must be at least 3 characters long' }

  if (normalized.length > USERNAME_LIMIT)
    return { success: false, message: `Username must be ${USERNAME_LIMIT} characters or less` }

  if (!/^\w+$/.test(normalized))
    return { success: false, message: 'Username can only contain letters, numbers, and underscores' }

  if (!userId.value && !debugOptions.bypassAuth)
    return { success: false, message: 'User ID not found' }

  try {
    if (isDev && debugOptions.bypassAuth) {
      await new Promise(resolve => setTimeout(resolve, 400))
      return { success: true }
    }

    if (!userId.value)
      return { success: false, message: 'User ID not found' }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        username: normalized,
        username_set: true,
      })
      .eq('id', userId.value)

    if (updateError) {
      if (updateError.code === '23505') {
        return { success: false, message: 'This username is already taken', code: updateError.code }
      }

      return { success: false, message: updateError.message, code: updateError.code }
    }

    invalidateUserProfileCache()
    return { success: true }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update username'
    return { success: false, message }
  }
}

interface AutoUsernameAttemptResult {
  attempted: boolean
  success: boolean
  errorMessage?: string
  suggestion?: string
  code?: string
}

async function attemptDiscordAutoUsername(): Promise<AutoUsernameAttemptResult> {
  if (discordUsernameAttempted)
    return { attempted: false, success: false }

  await ensureDiscordIdentity()
  const suggestion = getDiscordUsernameSuggestion()
  if (!suggestion)
    return { attempted: false, success: false }

  discordUsernameAttempted = true

  const result = await updateUsernameValue(suggestion)

  if (result.success)
    return { attempted: true, success: true }

  return {
    attempted: true,
    success: false,
    errorMessage: result.message,
    suggestion,
    code: result.code,
  }
}

async function ensureProfileDiscordId(currentDiscordId: string | null) {
  if (!user.value || !userId.value)
    return currentDiscordId

  await ensureDiscordIdentity()
  const discordIdentity = getDiscordIdentity()
  const discordId = extractDiscordId(discordIdentity)

  if (!discordId)
    return currentDiscordId

  if (isDev && debugOptions.bypassAuth)
    return discordId

  if (discordId === currentDiscordId || discordIdSyncInFlight)
    return currentDiscordId

  try {
    discordIdSyncInFlight = true
    const { data, error: fnError } = await supabase.functions.invoke('link-discord')

    if (fnError) {
      console.error('Error syncing Discord identity via function:', fnError)
      return currentDiscordId
    }

    if (data?.success && typeof data.discordId === 'string')
      return data.discordId

    if (data?.error)
      console.warn('Discord link function responded without success:', data.error)

    return currentDiscordId
  }
  catch (err) {
    console.error('Error syncing Discord identity:', err)
    return currentDiscordId
  }
  finally {
    discordIdSyncInFlight = false
  }
}

const hasAuthParams = computed(() => {
  if (typeof window === 'undefined')
    return false
  const hash = window.location.hash
  return hash && (hash.includes('access_token') || hash.includes('error'))
})

async function submitUsername() {
  usernameError.value = ''
  usernameLoading.value = true

  try {
    const result = await updateUsernameValue(username.value)

    if (!result.success) {
      usernameError.value = result.message ?? 'An error occurred'
      return
    }

    usernameStep.value = false
    processComplete.value = true
    scheduleProfileRedirect()
  }
  finally {
    usernameLoading.value = false
  }
}

async function handleEmailConfirmation() {
  if (isDev && debugOptions.bypassAuth) {
    loading.value = false
    checkUsernameStatus()
    return
  }

  try {
    const { data, error: authError } = await supabase.auth.getSession()
    if (authError)
      throw authError

    if (!data.session) {
      if (hasAuthParams.value) {
        const { data: authData } = await supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_IN' && session)
            checkUsernameStatus()
        })
        setTimeout(() => {
          authData.subscription.unsubscribe()
        }, 10000)
      }
      else {
        throw new Error('No authentication session found')
      }
    }
    else {
      await checkUsernameStatus()
    }
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'An unknown error occurred during authentication'
    console.error('Authentication error:', err)
    loading.value = false
  }
}

async function checkUsernameStatus() {
  if (!user.value && !debugOptions.bypassAuth) {
    loading.value = false
    return
  }

  try {
    if (isDev && debugOptions.bypassAuth) {
      if (debugOptions.forceUsernameStep) {
        usernameStep.value = true
      }
      else if (debugOptions.forceSuccess) {
        processComplete.value = true
        if (!debugOptions.skipRedirect) {
          setTimeout(() => {
            navigateTo('/profile')
          }, 1500)
        }
      }
      loading.value = false
      return
    }

    if (!user.value)
      throw new Error('User not found')

    await ensureDiscordIdentity()

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('username, username_set, discord_id')
      .eq('id', userId.value)
      .single()

    if (profileError)
      throw profileError

    const updatedDiscordId = await ensureProfileDiscordId(profileData?.discord_id ?? null)
    if (profileData && updatedDiscordId && profileData.discord_id !== updatedDiscordId)
      profileData.discord_id = updatedDiscordId

    if (!profileData || !profileData.username_set) {
      usernameError.value = ''

      const shouldAttemptAuto = !debugOptions.forceUsernameStep && !profileData?.username
      if (shouldAttemptAuto) {
        const autoResult = await attemptDiscordAutoUsername()

        if (autoResult.success) {
          usernameStep.value = false
          processComplete.value = true
          scheduleProfileRedirect()
          return
        }

        if (autoResult.attempted) {
          if (autoResult.suggestion)
            username.value = autoResult.suggestion
          if (autoResult.errorMessage)
            usernameError.value = autoResult.errorMessage
        }
      }

      usernameStep.value = true

      if (profileData?.username) {
        username.value = profileData.username
      }
      else if (!username.value) {
        const suggestion = getDiscordUsernameSuggestion()
        if (suggestion)
          username.value = suggestion
      }
    }
    else {
      processComplete.value = true
      scheduleProfileRedirect()
    }
  }
  catch (err) {
    console.error('Error checking username status:', err)
    error.value = err instanceof Error ? err.message : 'Failed to check profile status'
  }
  finally {
    loading.value = false
  }
}

watch(user, (newUser, oldUser) => {
  if (!newUser || oldUser?.id !== newUser.id) {
    resolvedDiscordIdentity.value = null
    discordIdentityFetchPromise = null
  }

  if (isDev && debugOptions.bypassAuth) {
    applyDebugOptions()
    return
  }

  if (newUser && !usernameStep.value && !loading.value)
    checkUsernameStatus()
}, { immediate: true })

onMounted(() => {
  if (isDev) {
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D')
        toggleDebugPanel()
    })
  }

  if (isDev && (debugOptions.forceUsernameStep || debugOptions.forceSuccess || debugOptions.forceError)) {
    applyDebugOptions()
    return
  }

  setTimeout(async () => {
    if (!user.value && !debugOptions.bypassAuth)
      await handleEmailConfirmation()
    else
      await checkUsernameStatus()
  }, 1000)
})
</script>

<template>
  <Flex y-center x-center class="flex-1 w-100" column>
    <Card class="auth-confirm-card text-center" separators>
      <template #header>
        <h3>Authentication</h3>
      </template>

      <div class="auth-confirm-content">
        <div v-if="loading" class="auth-confirm-state">
          <Spinner size="l" />
          <h4>Verifying your authentication...</h4>
          <p>Please wait while we complete your sign-in process.</p>
        </div>

        <div v-else-if="usernameStep" class="auth-confirm-state">
          <Icon name="ph:user-circle" size="48" class="mb-s" />
          <h4>Welcome to Hivecom!</h4>
          <p>
            Before continuing, please choose a unique username to identify yourself on the platform.
          </p>
          <Flex x-center column gap="l" class="w-100 mt-l" style="max-width: 320px;">
            <Input v-model="username" expand label="Username" placeholder="Choose a username">
              <template #start>
                <Icon name="ph:at" />
              </template>
            </Input>
            <Alert v-if="usernameError" variant="danger" filled>
              {{ usernameError }}
            </Alert>
            <Button expand variant="accent" :loading="usernameLoading" :disabled="!username" @click="submitUsername">
              <Flex y-center gap="xs">
                Continue
                <Icon name="ph:arrow-right" />
              </Flex>
            </Button>
          </Flex>
        </div>

        <div v-else-if="processComplete && !error" class="auth-confirm-state success">
          <Icon name="ph:check-circle" size="48" />
          <h4>Success!</h4>
          <p>You have been successfully authenticated.</p>
        </div>

        <div v-else-if="error" class="auth-confirm-state error">
          <ErrorAlert message="Authentication failed" :error="error" />

          <Flex x-center class="mt-l">
            <Button variant="fill" @click="router.push('/auth/sign-in')">
              Return to Sign In
            </Button>
          </Flex>
        </div>

        <div v-else class="auth-confirm-state">
          <Alert variant="info" filled>
            <p>Waiting for authentication confirmation...</p>
          </Alert>
        </div>
      </div>

      <template #footer>
        <Flex x-center>
          <p v-if="processComplete && !error" class="text-s text-color-light">
            {{ isDev && debugOptions.skipRedirect ? 'Redirect disabled in debug mode' : 'You will momentarily be redirected to your profile' }}
          </p>
        </Flex>
      </template>
    </Card>

    <Card v-if="isDev && showDebugPanel" class="debug-panel">
      <template #header>
        <Flex y-center gap="m">
          <Icon name="ph:bug" size="64" />
          <Flex column>
            <h3>Debug Panel</h3>
            <span class="text-s ml-auto">(Press Ctrl+Shift+D to toggle)</span>
          </Flex>
        </Flex>
      </template>

      <Flex column gap="m" class="p-m">
        <Flex y-center gap="m">
          <Switch v-model="debugOptions.bypassAuth" />
          <span>Bypass Authentication</span>
        </Flex>

        <Flex y-center gap="m">
          <Switch v-model="debugOptions.forceUsernameStep" :disabled="debugOptions.forceSuccess || debugOptions.forceError" />
          <span>Force Username Step</span>
        </Flex>

        <Flex y-center gap="m">
          <Switch v-model="debugOptions.forceSuccess" :disabled="debugOptions.forceUsernameStep || debugOptions.forceError" />
          <span>Force Success State</span>
        </Flex>

        <Flex y-center gap="m">
          <Switch v-model="debugOptions.forceError" :disabled="debugOptions.forceUsernameStep || debugOptions.forceSuccess" />
          <span>Force Error State</span>
        </Flex>

        <Flex y-center gap="m">
          <Switch v-model="debugOptions.skipRedirect" />
          <span>Skip Redirect</span>
        </Flex>

        <Flex v-if="debugOptions.forceError" column gap="s">
          <label>Custom Error Message:</label>
          <Input v-model="debugOptions.customError" expand />
        </Flex>

        <Button expand variant="accent" @click="applyDebugOptions">
          Apply Debug Settings
        </Button>
      </Flex>
    </Card>
  </Flex>
</template>

<style lang="scss" scoped>
.auth-confirm-card {
  max-width: 480px;
  margin: 4rem auto;
}

.auth-confirm-content {
  padding: 2rem 1rem;
}

.auth-confirm-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;

  h4 {
    margin-top: 1rem;
    margin-bottom: 0.5rem;
  }

  p {
    margin-bottom: 1rem;
    color: var(--color-text);
  }

  &.success {
    color: var(--color-text-green);

    .icon {
      color: var(--color-text-green);
    }
  }

  &.error {
    .icon {
      color: var(--color-text-red);
    }
  }
}

.debug-panel {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 320px;
  z-index: 1000;
  opacity: 0.95;

  &:hover {
    opacity: 1;
  }
}
</style>
