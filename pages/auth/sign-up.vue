<script setup lang="ts">
import { Alert, Button, Card, Flex, Input } from '@dolanske/vui'
import '@/assets/elements/auth.scss'

const supabase = useSupabaseClient()
const email = ref('')
const err = ref('')
const loading = ref(false)
const showEmailNotice = ref(false)

async function signInWithOtp() {
  loading.value = true

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
    err.value = error.message
    showEmailNotice.value = false
  }
  else {
    err.value = ''
    showEmailNotice.value = true
  }

  loading.value = false
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
          <Alert v-if="showEmailNotice" filled variant="info">
            An email with a sign-up link has been sent to your inbox!
          </Alert>
          <Alert v-if="err" variant="danger" filled>
            {{ err }}
          </Alert>
        </Flex>
      </div>
      <template #footer>
        <div class="sign-up-footer">
          <p>
            By signing up, you agree to our <NuxtLink to="/legal/terms">
              Terms of Service
            </NuxtLink> and <NuxtLink to="/legal/privacy">
              Privacy Policy
            </NuxtLink>.
          </p>
          <NuxtLink to="/auth/sign-in">
            <Button variant="link" class="sign-up-footer-link">
              Already have an account? Click to sign in!
            </Button>
          </NuxtLink>
        </div>
      </template>
    </Card>
  </Flex>
</template>

<style lang="scss" scoped>
.sign-up-footer {
  padding: 1rem;
  text-align: center;
  color: var(--color-text-light);
}
.sign-up-footer p {
  font-size: 1rem;
  margin: 0;
  padding: 0;
}

.sign-up-footer-link {
  margin-top: 2rem;
  font-size: 1.2rem;
  width: 100%;
}
</style>
