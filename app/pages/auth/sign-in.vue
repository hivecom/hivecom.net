<script setup lang="ts">
import { Alert, Button, Card, Flex, Input, Tab, Tabs } from '@dolanske/vui'

import '@/assets/elements/auth.scss'

const route = useRoute()
const supabase = useSupabaseClient()
const loading = ref(false)
const discordLoading = ref(false)
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const tab = ref('Password')

const showEmailNotice = ref(false)

watch(tab, () => showEmailNotice.value = false)

watchEffect(() => {
  if (route.query.banned === '1') {
    errorMessage.value = typeof route.query.message === 'string'
      ? route.query.message
      : 'Your account is currently suspended. Please contact support.'
  }
})

async function signIn() {
  loading.value = true

  try {
    if (tab.value === 'Password') {
      await signInWithPassword()
    }
    else {
      await signInWithOtp()
    }
  }
  catch (error) {
    console.error('Sign-in error:', error)
  }
  finally {
    loading.value = false
  }
}

function getAuthRedirectUrl() {
  if (process.env.NODE_ENV === 'development')
    return 'http://localhost:3000/auth/confirm'

  if (typeof window !== 'undefined')
    return `${window.location.origin}/auth/confirm`

  return '/auth/confirm'
}

async function signInWithOtp() {
  // Make sure that the following URLs are whitelisted in your Supabase project settings
  // http://localhost:3000/auth/*
  // https://dev.hivecom.net/auth/*
  // https://hivecom.net/auth/*

  const redirectUrl = getAuthRedirectUrl()

  const { error } = await supabase.auth.signInWithOtp({
    email: email.value,
    options: {
      emailRedirectTo: redirectUrl,
    },
  })

  if (error) {
    errorMessage.value = error.message
  }
  else {
    showEmailNotice.value = true
  }
}

async function signInWithDiscord() {
  errorMessage.value = ''
  discordLoading.value = true

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: getAuthRedirectUrl(),
        scopes: 'identify',
      },
    })

    if (error)
      throw error
  }
  catch (error) {
    console.error('Discord sign-in error:', error)
    errorMessage.value = error instanceof Error ? error.message : 'Unable to sign in with Discord.'
  }
  finally {
    discordLoading.value = false
  }
}

async function signInWithPassword() {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  })

  if (error) {
    errorMessage.value = error.message
  }
  else {
    navigateTo('/')
  }
}

// Clear errors when properties change
watch([email, password], () => errorMessage.value = '')

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
        <h4>Sign in</h4>
      </template>
      <div class="container container-xs" style="min-height:356px">
        <Flex x-center y-center column gap="l" class="py-l">
          <Button variant="gray" :loading="discordLoading" class="w-100" @click="signInWithDiscord">
            <Flex y-center gap="s">
              <Icon name="ph:discord-logo" />
              Continue with Discord
            </Flex>
          </Button>
          <Tabs v-model="tab" variant="filled" expand>
            <Tab value="Password" />
            <Tab value="E-mail" />
          </Tabs>
          <Input ref="email-input" v-model="email" expand placeholder="user@example.com" label="Email" type="email" />
          <Input v-if="tab === 'Password'" v-model="password" expand placeholder="●●●●●●●●●●●●●" label="Password" type="password" />
          <Button variant="fill" :loading="loading" :disabled="tab === 'Password' ? !(email && password) : !email" @click="signIn">
            Sign in
            <template #end>
              <Icon name="ph:sign-in" class="color-text-black" />
            </template>
          </Button>
          <Alert v-if="showEmailNotice" filled variant="info">
            <p class="text-s">
              An email with a sign-in link has been sent to your inbox! Please check your spam folder as well!
            </p>
          </Alert>
          <Alert v-if="errorMessage" variant="danger" filled>
            <p class="text-s">
              {{ errorMessage }}
            </p>
          </Alert>
        </Flex>
      </div>
      <template #footer>
        <NuxtLink to="/auth/sign-up" class="auth-link color-accent" aria-label="Sign up for a new account">
          Don't have an account? Click to sign-up!
        </NuxtLink>
        <NuxtLink to="/auth/forgot-password" class="auth-link" aria-label="Reset your password">
          Forgot your password?
        </NuxtLink>
      </template>
    </Card>
  </Flex>
</template>

<style lang="scss" scoped>
.auth-link {
  display: block;
  width: 100%;
  font-size: var(--font-size-m);
  padding: var(--space-s) var(--space-m);
  text-decoration: none;
  border-radius: var(--border-radius-s);
  transition: background-color 0.2s ease;
  text-align: center;

  &:hover {
    background-color: var(--color-bg-raised);
  }
}
</style>
