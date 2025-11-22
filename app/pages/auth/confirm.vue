<script setup lang="ts">
import { Alert, Button, Card, Flex, Input, Spinner, Switch } from '@dolanske/vui'
import ErrorAlert from '@/components/Shared/ErrorAlert.vue'

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

const hasAuthParams = computed(() => {
  if (typeof window === 'undefined')
    return false
  const hash = window.location.hash
  return hash && (hash.includes('access_token') || hash.includes('error'))
})

async function submitUsername() {
  if (!username.value || username.value.length < 3) {
    usernameError.value = 'Username must be at least 3 characters long'
    return
  }

  usernameLoading.value = true
  if (!user.value?.id && !debugOptions.bypassAuth) {
    usernameError.value = 'User ID not found'
    usernameLoading.value = false
    return
  }

  try {
    if (isDev && debugOptions.bypassAuth) {
      await new Promise(resolve => setTimeout(resolve, 800))
    }
    else {
      if (!user.value?.id)
        throw new Error('User ID not found')

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          username: username.value,
          username_set: true,
        })
        .eq('id', userId.value)

      if (updateError) {
        if (updateError.code === '23505') {
          usernameError.value = 'This username is already taken'
        }
        else {
          usernameError.value = updateError.message
        }
        return
      }
    }

    usernameStep.value = false
    processComplete.value = true

    if (!debugOptions.skipRedirect) {
      setTimeout(() => {
        navigateTo('/profile')
      }, 1500)
    }
  }
  catch (err) {
    usernameError.value = err instanceof Error ? err.message : 'An error occurred'
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

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('username, username_set')
      .eq('id', userId.value)
      .single()

    if (profileError)
      throw profileError

    if (!profileData || !profileData.username_set) {
      usernameStep.value = true
      if (profileData?.username)
        username.value = profileData.username
    }
    else {
      processComplete.value = true
      if (!debugOptions.skipRedirect) {
        setTimeout(() => {
          navigateTo('/profile')
        }, 1500)
      }
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

watch(user, (newUser) => {
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
