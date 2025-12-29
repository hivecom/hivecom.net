<script setup lang="ts">
import { Alert, Button, Card, Flex, Input, Spinner } from '@dolanske/vui'
import ErrorAlert from '@/components/Shared/ErrorAlert.vue'

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()
const route = useRoute()

const loading = ref(true)
const error = ref('')
const password = ref('')
const passwordConfirm = ref('')
const passwordLoading = ref(false)
const passwordResetReady = ref(false)
const passwordResetSuccess = ref(false)
const passwordResetError = ref('')

const hasRecoveryParams = computed(() => {
  const hashSource = route.hash || (typeof window !== 'undefined' ? window.location.hash : '')
  const hashIncludesRecovery = typeof hashSource === 'string' && hashSource.includes('type=recovery')
  const query = route.query || {}
  const hasCode = typeof query.code === 'string'
  const hasTokenHash = typeof query.token_hash === 'string'
  const hasTypeRecovery = typeof query.type === 'string' && query.type === 'recovery'

  return Boolean(hashIncludesRecovery || hasCode || hasTokenHash || hasTypeRecovery)
})

let authSubscription: { unsubscribe: () => void } | null = null
let recoveryTimeout: ReturnType<typeof setTimeout> | null = null

function clearRecoveryTimeout() {
  if (recoveryTimeout) {
    clearTimeout(recoveryTimeout)
    recoveryTimeout = null
  }
}

function clearAuthSubscription() {
  authSubscription?.unsubscribe()
  authSubscription = null
}

async function initializeRecoveryFlow() {
  if (!hasRecoveryParams.value) {
    router.replace('/auth/forgot-password')
    return
  }

  try {
    const { data, error: sessionError } = await supabase.auth.getSession()
    if (sessionError)
      throw sessionError

    if (data.session || user.value) {
      passwordResetReady.value = true
      loading.value = false
      error.value = ''
      clearRecoveryTimeout()
      clearAuthSubscription()
      return
    }

    const { data: authData } = await supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        passwordResetReady.value = true
        loading.value = false
        error.value = ''
        clearRecoveryTimeout()
        clearAuthSubscription()
      }

      if (event === 'SIGNED_OUT') {
        passwordResetReady.value = false
      }
    })

    authSubscription = authData.subscription

    recoveryTimeout = setTimeout(() => {
      if (!passwordResetReady.value) {
        error.value = 'Password reset link is invalid or expired.'
        loading.value = false
        clearAuthSubscription()
      }
    }, 10000)
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to validate password reset link.'
    loading.value = false
  }
}

async function submitPasswordReset() {
  if (!password.value || password.value.length < 8) {
    passwordResetError.value = 'Password must be at least 8 characters long.'
    return
  }

  if (password.value !== passwordConfirm.value) {
    passwordResetError.value = 'Passwords do not match.'
    return
  }

  passwordLoading.value = true
  passwordResetError.value = ''

  try {
    const { error: updateError } = await supabase.auth.updateUser({ password: password.value })
    if (updateError) {
      passwordResetError.value = updateError.message
      return
    }

    passwordResetSuccess.value = true
    passwordResetReady.value = false

    setTimeout(() => {
      router.push('/profile/settings')
    }, 2000)
  }
  catch (err) {
    passwordResetError.value = err instanceof Error ? err.message : 'An error occurred.'
  }
  finally {
    passwordLoading.value = false
  }
}

watch(user, (newUser) => {
  if (newUser && !passwordResetReady.value) {
    passwordResetReady.value = true
    loading.value = false
    error.value = ''
    clearRecoveryTimeout()
  }
})

onMounted(() => {
  initializeRecoveryFlow()
})

onBeforeUnmount(() => {
  clearAuthSubscription()
  clearRecoveryTimeout()
})
</script>

<template>
  <Flex y-center x-center class="flex-1 w-100" column>
    <Card class="auth-confirm-card text-center" separators>
      <template #header>
        <h3>Reset Password</h3>
      </template>

      <div class="auth-confirm-content">
        <div v-if="loading" class="auth-confirm-state">
          <Spinner size="l" />
          <h4>Verifying your request...</h4>
          <p>Hold on while we verify your password reset link.</p>
        </div>

        <div v-else-if="passwordResetSuccess" class="auth-confirm-state success">
          <Icon name="ph:check-circle" size="48" />
          <h4>Password changed!</h4>
          <p>Your password has been updated. You can sign in with your new password in just a moment.</p>
        </div>

        <div v-else-if="passwordResetReady" class="auth-confirm-state">
          <Icon name="ph:key" size="48" class="mb-s" />
          <h4>Choose a new password</h4>
          <p>Enter and confirm the new password for your Hivecom account.</p>
          <Flex x-center column gap="l" class="w-100 mt-l" style="max-width: 320px;">
            <Input v-model="password" expand label="New Password" placeholder="Enter new password" type="password" />
            <Input v-model="passwordConfirm" expand label="Confirm Password" placeholder="Confirm new password" type="password" />
            <Alert v-if="passwordResetError" variant="danger" filled>
              {{ passwordResetError }}
            </Alert>
            <Button expand variant="accent" :loading="passwordLoading" @click="submitPasswordReset">
              Set Password
            </Button>
          </Flex>
        </div>

        <div v-else-if="error" class="auth-confirm-state error">
          <ErrorAlert message="Password reset failed" :error="error" />

          <Flex x-center class="mt-l" gap="s">
            <Button variant="fill" @click="router.push('/auth/forgot-password')">
              Request New Link
            </Button>
            <Button variant="gray" @click="router.push('/auth/sign-in')">
              Back to Sign In
            </Button>
          </Flex>
        </div>

        <div v-else class="auth-confirm-state">
          <Alert variant="info" filled>
            <p>Waiting for password reset confirmation...</p>
          </Alert>
        </div>
      </div>
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
</style>
