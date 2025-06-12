<script setup lang="ts">
import { Alert, Button, Card, Flex, Input } from '@dolanske/vui'
import '@/assets/elements/auth.scss'

const supabase = useSupabaseClient()
const loading = ref(false)
const email = ref('')
const errorMessage = ref('')
const showEmailNotice = ref(false)

async function resetPassword() {
  loading.value = true

  const redirectUrl = process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000/auth/confirm'
    : `${window.location.origin}/auth/confirm`

  const { error } = await supabase.auth.resetPasswordForEmail(email.value, {
    redirectTo: redirectUrl,
  })

  if (error) {
    errorMessage.value = error.message
    showEmailNotice.value = false
  }
  else {
    errorMessage.value = ''
    showEmailNotice.value = true
  }

  loading.value = false
}

// Clear errors when email changes
watch(email, () => errorMessage.value = '')

// Auto-focus email input on page load
const emailInputRef = useTemplateRef('email-input')

onMounted(() => {
  // Ensure all sub-components are mounted
  nextTick(() => {
    if (emailInputRef.value) {
      emailInputRef.value.focus()
    }
  })
})
</script>

<template>
  <Flex y-center x-center class="flex-1 w-100" column>
    <Card class="login-card" separators>
      <template #header>
        <h4>Reset Password</h4>
      </template>
      <div class="container container-xs" style="min-height:280px">
        <Flex x-center y-center column gap="l" class="py-l">
          <Input ref="email-input" v-model="email" expand placeholder="user@example.com" label="Email" type="email" />
          <Button variant="fill" :loading="loading" :disabled="!email" @click="resetPassword">
            Reset Password
            <template #end>
              <Icon name="ph:envelope" color="white" />
            </template>
          </Button>
          <Alert v-if="showEmailNotice" filled variant="info">
            <p>A password reset link has been sent to {{ email }}</p>
          </Alert>
          <Alert v-if="errorMessage" variant="danger" filled>
            {{ errorMessage }}
          </Alert>
        </Flex>
      </div>
      <template #footer>
        <NuxtLink to="/auth/sign-in" class="auth-link color-accent" aria-label="Return to sign in page">
          Back to Sign In
        </NuxtLink>
      </template>
    </Card>
  </Flex>
</template>

<style lang="scss" scoped>
.auth-link {
  font-size: var(--font-size-m);
  width: 100%;
  display: block;
  text-decoration: none;
  padding: var(--space-s) var(--space-m);
  border-radius: var(--border-radius-s);
  transition: background-color 0.2s ease;
  text-align: center;

  &:hover {
    background-color: var(--color-bg-raised);
  }
}
</style>
