<script setup lang="ts">
import { Alert, Button, Card, Flex, Input, Tab, Tabs } from '@dolanske/vui'

import '@/assets/elements/auth.scss'

const supabase = useSupabaseClient()
const loading = ref(false)
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const tab = ref('Password')

const showEmailNotice = ref(false)

watch(tab, () => showEmailNotice.value = false)

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

async function signInWithOtp() {
  // Make sure that the following URLs are whitelisted in your Supabase project settings
  // http://localhost:3000/auth/*
  // https://dev.hivecom.net/auth/*
  // https://hivecom.net/auth/*

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
    errorMessage.value = error.message
  }
  else {
    showEmailNotice.value = true
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
          <Tabs v-model="tab" variant="filled" expand>
            <Tab label="Password" />
            <Tab label="E-mail" />
          </Tabs>
          <Input ref="email-input" v-model="email" expand placeholder="user@example.com" label="Email" type="email" />
          <Input v-if="tab === 'Password'" v-model="password" expand placeholder="************" label="Password" type="password" />
          <Button variant="fill" :loading="loading" :disabled="tab === 'Password' ? !(email && password) : !email" @click="signIn">
            Sign in
            <template #end>
              <Icon name="ph:sign-in" color="white" />
            </template>
          </Button>
          <Alert v-if="showEmailNotice" filled variant="info">
            An email with a sign-in link has been sent to your inbox!
          </Alert>
          <Alert v-if="errorMessage" variant="danger" filled>
            {{ errorMessage }}
          </Alert>
        </Flex>
      </div>
      <template #footer>
        <NuxtLink to="/auth/sign-up">
          <Button variant="link" class="sign-up-link">
            Don't have an account? Click to sign-up!
          </Button>
        </NuxtLink>
        <NuxtLink to="/auth/forgot-password">
          <Button variant="link" class="forgot-password-link">
            Forgot your password?
          </Button>
        </NuxtLink>
      </template>
    </Card>
  </Flex>
</template>

<style lang="scss" scoped>
.sign-up-link {
  color: var(--color-text-accent);
  font-size: 1.2rem;
  width: 100%;
}
.forgot-password-link {
  font-size: 1.2rem;
  width: 100%;
}
</style>
