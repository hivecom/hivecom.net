<script setup lang="ts">
import { Button, Card, Flex, Input } from '@dolanske/vui'
import '@/assets/elements/auth.scss'

const supabase = useSupabaseClient()
const email = ref('')
const err = ref('')

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
</script>

<template>
  <Card class="login-card" separators style="height:424px">
    <template #header>
      <h4>Sign up</h4>
    </template>
    <div class="container container-xs">
      <Flex justify-center align-center column :style="{ paddingBlock: '64px' }" gap="l">
        <Input v-model="email" expand placeholder="user@example.com" label="Email" type="email" />
        <Button variant="fill" :disabled="!email" @click="signInWithOtp">
          Sign up
          <template #end>
            <Icon name="ph:sign-in" color="white" />
          </template>
        </Button>
        <p v-if="err" class="mt-l text-center color-text-red">
          {{ err }}
        </p>
      </Flex>
    </div>
    <NuxtLink to="/auth/sign-in">
      <Button variant="link" style="width: 100%; margin-top: 2rem; font-size: 1.2rem;">
        Already have an account? Click to sign in!
      </Button>
    </NuxtLink>
  </Card>
</template>
