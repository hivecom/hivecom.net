<script setup lang="ts">
import { Button, Card, Input } from '@dolanske/vui'

const supabase = useSupabaseClient()
const email = ref('')
const err = ref('')

async function signInWithOtp() {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.value,
    options: {
      emailRedirectTo: 'http://localhost:3000/confirm',
    },
  })
  if (error) {
    err.value = error.message
  }
}

watch(email, () => {
  if (err.value) {
    err.value = ''
  }
})
</script>

<template>
  <div>
    <Card separators>
      <template #header>
        <h4>Sign in</h4>
      </template>

      <Input v-model="email" placeholder="exmaple@example.com" label="Email" type="email" :errors="err ? [err] : []" :style="{ marginBottom: '16px' }" />

      <Button @click="signInWithOtp">
        Sign In with E-Mail
      </Button>
    </Card>
  </div>
</template>
