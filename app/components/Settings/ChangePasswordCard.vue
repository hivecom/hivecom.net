<script setup lang="ts">
import { Alert, Button, Card, Flex } from '@dolanske/vui'

const supabase = useSupabaseClient()
const user = useSupabaseUser()

const passwordResetLoading = ref(false)
const passwordResetSent = ref(false)
const passwordResetError = ref('')

const passwordResetHint = computed(() => (user.value?.email
  ? `We'll email ${user.value.email}`
  : 'Add an email to receive reset links.'))

async function sendPasswordReset() {
  passwordResetLoading.value = true
  passwordResetError.value = ''
  passwordResetSent.value = false

  try {
    if (!user.value?.email) {
      passwordResetError.value = 'No email found for your account.'
      return
    }

    const redirectUrl = import.meta.client
      ? (process.env.NODE_ENV === 'development'
          ? 'http://localhost:3000/auth/confirm'
          : `${window.location.origin}/auth/confirm`)
      : undefined

    const { error } = await supabase.auth.resetPasswordForEmail(user.value.email, redirectUrl ? { redirectTo: redirectUrl } : undefined)
    if (error)
      throw error

    passwordResetSent.value = true
  }
  catch (error) {
    passwordResetError.value = error instanceof Error ? error.message : 'An error occurred.'
  }
  finally {
    passwordResetLoading.value = false
  }
}
</script>

<template>
  <Card separators>
    <template #header>
      <Flex x-between y-center>
        <h3>Change Password</h3>
        <Icon name="ph:key" />
      </Flex>
    </template>

    <Flex column gap="l">
      <Flex column class="settings-callout" gap="l" wrap expand>
        <Flex gap="m" y-start class="settings-callout__content" expand>
          <div class="settings-callout__icon">
            <Icon name="ph:lock-key" size="26" />
          </div>
          <Flex column gap="xs">
            <strong>Reset Password</strong>
            <p class="text-s text-color-lighter">
              Setting a password also lets you sign in directly without email links.
            </p>
          </Flex>
        </Flex>
        <Flex gap="s" class="settings-callout__actions" y-center>
          <Button :loading="passwordResetLoading" variant="accent" @click="sendPasswordReset">
            Send Password Reset Email
          </Button>
          <span class="text-xs text-color-lighter">
            {{ passwordResetHint }}
          </span>
        </Flex>
      </Flex>

      <Alert v-if="passwordResetSent" filled variant="info">
        A password reset link has been sent to your email address.
      </Alert>
      <Alert v-if="passwordResetError" filled variant="danger">
        {{ passwordResetError }}
      </Alert>
    </Flex>
  </Card>
</template>

<style scoped>
.settings-callout {
  width: 100%;
  padding: var(--space-l);
  border-radius: var(--border-radius-l);
  border: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.settings-callout__content {
  flex: 1;
  min-width: 220px;
}

.settings-callout__icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-accent), var(--color-accent-strong));
  color: var(--color-bg, #04060d);
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-callout__list {
  color: inherit;
}

.settings-callout__actions {
  min-width: 220px;
  flex-shrink: 0;
}
</style>
