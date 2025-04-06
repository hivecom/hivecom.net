<script setup lang="ts">
import { Button, Card, Flex, Input } from '@dolanske/vui'

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
      <h4>Sign in</h4>
    </template>
    <div class="container container-xs">
      <Flex justify-center align-center column :style="{ paddingBlock: '64px' }" gap="l">
        <Input v-model="email" expand placeholder="user@example.com" label="Email" type="email" />
        <Button variant="accent" :disabled="!email" @click="signInWithOtp">
          Sign up
          <template #end>
            <Icon name="ph:sign-up" color="white" />
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
