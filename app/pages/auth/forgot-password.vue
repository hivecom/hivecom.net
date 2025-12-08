<script setup lang="ts">
import { Alert, Button, Card, Flex, Input } from '@dolanske/vui'
import MetaballContainer from '@/components/Shared/MetaballContainer.vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import '@/assets/elements/auth.scss'

const supabase = useSupabaseClient()
const loading = ref(false)
const email = ref('')
const errorMessage = ref('')
const showEmailNotice = ref(false)
const isBelowSm = useBreakpoint('<sm')
const metaballHeight = computed(() => (isBelowSm.value ? '100vh' : 'min(320px, 96vh)'))
const metaballWidth = computed(() => (isBelowSm.value ? '100vw' : 'min(520px, 96vw)'))

async function resetPassword() {
  loading.value = true

  const redirectUrl = process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000/auth/confirm-password'
    : `${window.location.origin}/auth/confirm-password`

  const { error } = await supabase.auth.resetPasswordForEmail(email.value, {
    redirectTo: redirectUrl,
  })

  if (error) {
    errorMessage.value = error.message
    showEmailNotice.value = false
  }
  else {
    errorMessage.value = ''
    showEmailNotice.value = true
  }

  loading.value = false
}

// Clear errors when email changes
watch(email, () => errorMessage.value = '')

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
  <Flex y-center x-center class="sign-in-page" column expand>
    <MetaballContainer :width="metaballWidth" :height="metaballHeight" min-height="520px">
      <Card class="login-card" separators>
        <template #header>
          <h4>Reset Password</h4>
        </template>
        <div class="container container-xs">
          <Flex x-center y-center column gap="l" class="py-l">
            <Input ref="email-input" v-model="email" expand placeholder="user@example.com" label="Email" type="email" />
            <Button expand variant="fill" :loading="loading" :disabled="!email" @click="resetPassword">
              Reset Password
              <template #end>
                <Icon name="ph:envelope" color="white" />
              </template>
            </Button>
            <Alert v-if="showEmailNotice" filled variant="info">
              <p class="text-s">
                A password reset link has been sent to {{ email }}
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
          <NuxtLink to="/auth/sign-in" class="auth-link text-color-accent" aria-label="Return to sign in page">
            Back to Sign In
          </NuxtLink>
        </template>
      </Card>
    </MetaballContainer>

    <div class="animated-blob first" />
    <div class="animated-blob second" />
  </Flex>
</template>

<style lang="scss" scoped>
.auth-link {
  font-size: var(--font-size-m);
  width: 100%;
  display: block;
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
