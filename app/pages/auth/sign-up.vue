<script setup lang="ts">
import type { Provider } from '@supabase/supabase-js'
import { Alert, Button, Card, Flex, Input } from '@dolanske/vui'
import '@/assets/elements/auth.scss'

const supabase = useSupabaseClient()
const email = ref('')
const err = ref('')
const loading = ref(false)
const discordLoading = ref(false)
const patreonLoading = ref(false)
const showEmailNotice = ref(false)

const isDev = process.env.NODE_ENV === 'development'

function skipToConfirm() {
  window.location.href = '/auth/confirm'
}

async function signInWithOtp() {
  loading.value = true

  const redirectUrl = getAuthRedirectUrl()

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

function getAuthRedirectUrl() {
  if (process.env.NODE_ENV === 'development')
    return 'http://localhost:3000/auth/confirm'

  if (typeof window !== 'undefined')
    return `${window.location.origin}/auth/confirm`

  return '/auth/confirm'
}

async function signUpWithDiscord() {
  err.value = ''
  showEmailNotice.value = false
  discordLoading.value = true

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: getAuthRedirectUrl(),
      },
    })

    if (error)
      throw error
  }
  catch (error) {
    console.error('Discord sign-up error:', error)
    err.value = error instanceof Error ? error.message : 'Unable to continue with Discord.'
  }
  finally {
    discordLoading.value = false
  }
}

async function signUpWithPatreon() {
  err.value = ''
  showEmailNotice.value = false
  patreonLoading.value = true

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'patreon' as unknown as Provider,
      options: {
        redirectTo: getAuthRedirectUrl(),
      },
    })

    if (error)
      throw error
  }
  catch (error) {
    console.error('Patreon sign-up error:', error)
    err.value = error instanceof Error ? error.message : 'Unable to continue with Patreon.'
  }
  finally {
    patreonLoading.value = false
  }
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
          <Flex column gap="s" class="w-100">
            <Button variant="gray" :loading="discordLoading" class="w-100" @click="signUpWithDiscord">
              <Flex y-center gap="s">
                <Icon name="ph:discord-logo" />
                Continue with Discord
              </Flex>
            </Button>
            <Button variant="gray" :loading="patreonLoading" class="w-100" @click="signUpWithPatreon">
              <Flex y-center gap="s">
                <Icon name="simple-icons:patreon" />
                Continue with Patreon
              </Flex>
            </Button>
          </Flex>
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
    color: var(--text-color-light);

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
