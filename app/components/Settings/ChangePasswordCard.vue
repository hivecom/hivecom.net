<script setup lang="ts">
import { Alert, Button, Card, Flex } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'
import { scrollToId } from '@/lib/utils/common'

const supabase = useSupabaseClient()
const user = useSupabaseUser()

const passwordResetLoading = ref(false)
const passwordResetSent = ref(false)
const passwordResetError = ref('')

const isBelowSmall = useBreakpoint('<s')

// const passwordResetHint = computed(() => (user.value?.email
//   ? `We'll email ${user.value.email}`
//   : 'Add an email to receive reset links.'))

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
          ? 'http://localhost:3000/auth/confirm-password'
          : `${window.location.origin}/auth/confirm-password`)
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
  <Card v-if="user?.email" class="card-bg" separators>
    <template #header>
      <Flex gap="xxs" column>
        <h4>Change Password</h4>
        <p class="text-m text-color-lighter">
          Setting a password also lets you sign in directly without email links.
        </p>
      </Flex>
    </template>

    <Flex column gap="s">
      <Alert v-if="passwordResetSent" filled variant="info">
        A password reset link has been sent to your email address.
      </Alert>
      <Alert v-if="passwordResetError" filled variant="danger">
        {{ passwordResetError }}
      </Alert>
      <Flex
        gap="s"
        class="settings-callout__actions"
        :column="isBelowSmall"
        :row="!isBelowSmall"
        :y-center="!isBelowSmall"
        :expand="isBelowSmall"
        :style="{ minWidth: isBelowSmall ? '0' : undefined }"
      >
        <Button :expand="isBelowSmall" :loading="passwordResetLoading" variant="gray" @click="sendPasswordReset">
          Send Password Reset Email
        </Button>
      </Flex>
    </Flex>
  </Card>
  <Card v-else class="card-bg" separators>
    <template #header>
      <Flex gap="xxs" column>
        <h4>Change Password</h4>
        <p class="text-m text-color-lighter">
          Add an email to receive reset links.
        </p>
      </Flex>
    </template>
    <Button @click="scrollToId('#account', 'start')">
      Add Email
    </Button>
  </Card>
</template>

<style scoped>
.settings-callout__content {
  flex: 1;
  min-width: 220px;
}

.settings-callout__icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--color-bg, #0e1018);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
}

.settings-callout__list {
  color: inherit;
}

.settings-callout__actions {
  min-width: 220px;
  flex-shrink: 0;
}
</style>
