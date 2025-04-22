<script setup lang="ts">
import { Alert, Button, Card, Flex, Spinner } from '@dolanske/vui'
import ErrorAlert from '~/components/Shared/ErrorAlert.vue'

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()

const loading = ref(true)
const error = ref('')
const processComplete = ref(false)

// Check if we have hash parameters in the URL for authentication
const hasAuthParams = computed(() => {
  const hash = window.location.hash
  return hash && (hash.includes('access_token') || hash.includes('error') || hash.includes('type=recovery'))
})

// Handle the authentication with Supabase
async function handleEmailConfirmation() {
  try {
    const { data, error: authError } = await supabase.auth.getSession()

    if (authError) {
      throw authError
    }

    if (!data.session) {
      // Try to get auth parameters from the URL hash
      if (hasAuthParams.value) {
        // Process the email link confirmation
        const { data: authData } = await supabase.auth.onAuthStateChange((event) => {
          if (event === 'SIGNED_IN') {
            processComplete.value = true
          }
        })

        // Need to manually unsubscribe when done
        setTimeout(() => {
          authData.subscription.unsubscribe()
        }, 10000) // Unsubscribe after 10 seconds if no auth event occurs
      }
      else {
        // No session and no hash parameters - user needs to sign in
        throw new Error('No authentication session found')
      }
    }
    else {
      // User is authenticated
      processComplete.value = true
    }
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'An unknown error occurred during authentication'
    console.error('Authentication error:', err)
  }
  finally {
    loading.value = false
  }
}

// Watch for user state changes
watch(user, () => {
  if (user.value) {
    setTimeout(() => {
      navigateTo('/profile')
    }, 1500)
  }
}, { immediate: true })

// Process on component mount
onMounted(() => {
  // Let's wait a bit to ensure Supabase has time to process the email link
  setTimeout(async () => {
    if (!user.value) {
      await handleEmailConfirmation()
    }
    else {
      loading.value = false
      processComplete.value = true
    }
  }, 1000)
})
</script>

<template>
  <Card class="auth-confirm-card">
    <template #header>
      <h3>Authentication</h3>
    </template>

    <div class="auth-confirm-content">
      <!-- Loading state -->
      <div v-if="loading" class="auth-confirm-state">
        <Spinner size="l" />
        <h4>Verifying your authentication...</h4>
        <p>Please wait while we complete your sign-in process.</p>
      </div>

      <!-- Success state -->
      <div v-else-if="processComplete && !error" class="auth-confirm-state success">
        <Icon name="ph:check-circle" size="48" />
        <h4>Authentication successful!</h4>
        <p>You have been successfully authenticated.</p>
        <p class="text-s color-text-light">
          Redirecting to your profile...
        </p>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="auth-confirm-state error">
        <ErrorAlert message="Authentication failed" :error="error" />

        <Flex x-center class="mt-l">
          <Button variant="fill" @click="router.push('/auth/sign-in')">
            Return to Sign In
          </Button>
        </Flex>
      </div>

      <!-- Default state (should rarely be seen) -->
      <div v-else class="auth-confirm-state">
        <Alert variant="info" filled>
          <p>Waiting for authentication confirmation...</p>
        </Alert>
      </div>
    </div>
  </Card>
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
