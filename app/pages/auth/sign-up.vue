<script setup lang="ts">
import { Alert, Button, Card, Flex, Input } from '@dolanske/vui'
import MetaballContainer from '@/components/Shared/MetaballContainer.vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import '@/assets/elements/auth.scss'

const supabase = useSupabaseClient()
const email = ref('')
const err = ref('')
const loading = ref(false)
const discordLoading = ref(false)
const googleLoading = ref(false)
const showEmailNotice = ref(false)
const isBelowS = useBreakpoint('<s')
const metaballHeight = computed(() => (isBelowS.value ? '100vh' : 'min(720px, 96vh)'))
const metaballWidth = computed(() => (isBelowS.value ? '100vw' : 'min(520px, 96vw)'))

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

async function signUpWithGoogle() {
  err.value = ''
  showEmailNotice.value = false
  googleLoading.value = true

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getAuthRedirectUrl(),
        scopes: 'email profile',
      },
    })

    if (error)
      throw error
  }
  catch (error) {
    console.error('Google sign-up error:', error)
    err.value = error instanceof Error ? error.message : 'Unable to continue with Google.'
  }
  finally {
    googleLoading.value = false
  }
}
</script>

<template>
  <Flex y-center x-center class="sign-in-page" column expand>
    <MetaballContainer :width="metaballWidth" :height="metaballHeight" min-height="520px">
      <Card class="login-card" separators>
        <template #header>
          <h4>Sign up</h4>
        </template>
        <div class="container container-xs">
          <Flex x-center y-center column :style="{ paddingBlock: '64px' }" gap="l">
            <Flex column gap="s" class="w-100">
              <Button variant="gray" :loading="discordLoading" class="w-100" @click="signUpWithDiscord">
                <Flex y-center gap="s">
                  <Icon name="ph:discord-logo" />
                  Sign-up through Discord
                </Flex>
              </Button>
              <Button variant="gray" :loading="googleLoading" class="w-100" @click="signUpWithGoogle">
                <Flex y-center gap="s">
                  <Icon name="ph:google-logo" />
                  Sign-up through Google
                </Flex>
              </Button>
            </Flex>
            <Separator>or</Separator>
            <Input v-model="email" expand placeholder="user@example.com" label="Email" type="email" />
            <Button expand variant="fill" :loading="loading" :disabled="!email" @click="signInWithOtp">
              Sign up
            </Button>
            <p class="text-xxs text-color-lighter text-center">
              By signing up you agree to our <NuxtLink to="/legal/terms">
                Terms of Service
              </NuxtLink> &amp; <NuxtLink to="/legal/privacy">
                Privacy Policy
              </NuxtLink>.
            </p>
            <Alert v-if="showEmailNotice" filled variant="info">
              An email with a sign-up link has been sent to your inbox! (check spam just in case)
            </Alert>
            <Alert v-if="err" variant="danger" filled>
              {{ err }}
            </Alert>
            <Button v-if="isDev" variant="link" @click="skipToConfirm">
              Skip to Confirm
              <template #end>
                <Icon name="ph:arrow-right" />
              </template>
            </Button>
          </Flex>
        </div>
        <template #footer>
          <NuxtLink to="/auth/sign-in" class="auth-link text-color-accent" aria-label="Sign in to existing account">
            Already have an account? Click to sign in!
          </NuxtLink>
        </template>
      </Card>
    </MetaballContainer>

    <div class="animated-blob first" />
    <div class="animated-blob second" />
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
