<script setup lang="ts">
import { Alert, Button, Card, Flex, Input } from '@dolanske/vui'
import '@/assets/elements/auth.scss'

const supabase = useSupabaseClient()
const email = ref('')
const err = ref('')
const loading = ref(false)
const showEmailNotice = ref(false)

const isDev = process.env.NODE_ENV === 'development'

function skipToConfirm() {
  window.location.href = '/auth/confirm'
}

async function signInWithOtp() {
  loading.value = true

  const redirectUrl = process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000/auth/confirm'
    : `${window.location.origin}/auth/confirm`

  const { error } = await supabase.auth.signInWithOtp({
    email: email.value,
    options: {
      emailRedirectTo: redirectUrl,
    },
  })

  if (error) {
    err.value = error.message
    showEmailNotice.value = false
  }
  else {
    err.value = ''
    showEmailNotice.value = true
  }

  loading.value = false
}
</script>

<template>
  <Flex y-center x-center class="flex-1 w-100" column>
    <Card class="login-card" separators style="height:424px">
      <template #header>
        <h4>Sign up</h4>
      </template>
      <div class="container container-xs">
        <Flex x-center y-center column :style="{ paddingBlock: '64px' }" gap="l">
          <Input v-model="email" expand placeholder="user@example.com" label="Email" type="email" />
          <Button variant="fill" :loading="loading" :disabled="!email" @click="signInWithOtp">
            Sign up
            <template #end>
              <Icon name="ph:sign-in" color="white" />
            </template>
          </Button>
          <Button v-if="isDev" variant="link" @click="skipToConfirm">
            Skip to Confirm
            <template #end>
              <Icon name="ph:arrow-right" />
            </template>
          </Button>
          <Alert v-if="showEmailNotice" filled variant="info">
            An email with a sign-up link has been sent to your inbox! (check spam just in case)
          </Alert>
          <Alert v-if="err" variant="danger" filled>
            {{ err }}
          </Alert>
        </Flex>
      </div>
      <template #footer>
        <div class="sign-up__footer">
          <p>
            By signing up, you agree to our <NuxtLink to="/legal/terms">
              Terms of Service
            </NuxtLink> and <NuxtLink to="/legal/privacy">
              Privacy Policy
            </NuxtLink>.
          </p>
          <NuxtLink to="/auth/sign-in" class="auth-link color-accent" aria-label="Sign in to existing account">
            Already have an account? Click to sign in!
          </NuxtLink>
        </div>
      </template>
    </Card>
  </Flex>
</template>

<style lang="scss" scoped>
.sign-up {
  &__footer {
    padding: 1rem;
    text-align: center;
    color: var(--color-text-light);

    p {
      font-size: 1rem;
      margin: 0;
      padding: 0;
    }
  }
}

.auth-link {
  display: block;
  margin-top: 1rem;
  font-size: var(--font-size-m);
  width: 100%;
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
