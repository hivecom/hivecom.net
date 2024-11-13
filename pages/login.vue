<script setup lang="ts">
import { Button, Card, Flex, Input } from '@dolanske/vui'

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

      <Flex justify-center align-start :style="{ paddingBlock: '64px' }">
        <Input v-model="email" placeholder="exmaple@example.com" label="Email" type="email" :errors="err ? [err] : []" />
        <Button :style="{ marginTop: '23px' }" @click="signInWithOtp">
          Sign In with E-Mail
        </Button>
      </Flex>
    </Card>
  </div>
</template>
