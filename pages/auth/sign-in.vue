<script setup lang="ts">
import { Alert, Button, Card, Flex, Input, Tab, Tabs } from '@dolanske/vui'
import '@/assets/pages/auth.scss'

const supabase = useSupabaseClient()
const email = ref('')
const password = ref('')
const err = ref('')
const tab = ref('Password')

const showEmailNotice = ref(false)

watch(tab, () => showEmailNotice.value = false)

function signIn() {
  if (tab.value === 'Password') {
    signInWithPassword()
  }
  else {
    signInWithOtp()
  }
}

async function signInWithOtp() {
  const redirectUrl = process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000/auth/confirm'
    : 'https://dev.hivecom.net/auth/confirm'

  const { error } = await supabase.auth.signInWithOtp({
    email: email.value,
    options: {
      emailRedirectTo: redirectUrl,
    },
  })

  if (error) {
    err.value = error.message
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
    err.value = error.message
  }
  else {
    navigateTo('/')
  }
}

// Clear errors when properties change
watch([email, password], () => err.value = '')

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
  <Card class="login-card" separators>
    <template #header>
      <h4>Sign in</h4>
    </template>
    <div class="container container-xs" style="min-height:356px">
      <Alert v-if="showEmailNotice" filled variant="info">
        <p>An email with the sing-in link has been sent to {{ email }} </p>
      </Alert>
      <Flex justify-center align-center column gap="l" class="py-l">
        <Tabs v-model="tab" variant="filled" expand>
          <Tab label="Password" />
          <Tab label="E-mail" />
        </Tabs>
        <Input ref="email-input" v-model="email" expand placeholder="user@example.com" label="Email" type="email" />
        <Input v-if="tab === 'Password'" v-model="password" expand placeholder="************" label="Password" type="password" />
        <Button variant="fill" :disabled="tab === 'Password' ? !(email && password) : !email" @click="signIn">
          Sign in
          <template #end>
            <Icon name="ph:sign-in" color="white" />
          </template>
        </Button>
        <p v-if="err" class="mt-l text-center color-text-red">
          {{ err }}
        </p>
      </Flex>
    </div>
    <NuxtLink to="/auth/sign-up">
      <Button variant="link" style="width: 100%; margin-top: 2rem; font-size: 1.2rem;">
        Don't have an account? Click to sign-up!
      </Button>
    </NuxtLink>
  </Card>
</template>
