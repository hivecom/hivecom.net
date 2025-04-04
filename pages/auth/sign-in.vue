<script setup lang="ts">
import { Button, Card, Flex, Input, Tab, Tabs } from '@dolanske/vui'

const supabase = useSupabaseClient()
const email = ref('')
const password = ref('')
const err = ref('')
const tab = ref('Normal')

function signIn() {
  if (tab.value === 'Normal') {
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

watch(email, () => err.value = '')
</script>

<template>
  <Card class="login-card" separators style="height:424px">
    <template #header>
      <h4>Sign in</h4>
    </template>
    <div class="container container-xs">
      <Flex justify-center align-center column :style="{ paddingBlock: '64px' }" gap="l">
        <Tabs v-model="tab" variant="filled" expand>
          <Tab label="Normal" />
          <Tab label="E-mail" />
        </Tabs>
        <Input v-model="email" expand placeholder="exmaple@example.com" label="Email" type="email" />
        <Input v-if="tab === 'Normal'" v-model="password" expand placeholder="************" label="Password" type="password" />
        <Button variant="accent" @click="signIn">
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
  </Card>
</template>

<style scoped lang="scss">
.login-card {
  width: 100%;
  max-width: 400px; /* Added max-width for better responsiveness */
}
</style>
