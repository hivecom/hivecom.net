<script setup lang="ts">
import { Alert, Button, Card, Flex, Input } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

const supabase = useSupabaseClient()
const user = useSupabaseUser()

const newEmail = ref('')
const confirmNewEmail = ref('')
const emailChangeLoading = ref(false)
const emailChangeSent = ref(false)
const emailChangeError = ref('')

const isBelowSmall = useBreakpoint('<s')

function isValidEmail(value: string): boolean {
  const [local, domain, ...rest] = value.split('@')
  if (!local || !domain || rest.length > 0)
    return false
  if (domain.startsWith('.') || domain.endsWith('.'))
    return false
  return domain.includes('.')
}

async function requestEmailChange() {
  emailChangeError.value = ''
  emailChangeSent.value = false

  if (!user.value?.email) {
    emailChangeError.value = 'No email found for your account.'
    return
  }

  const normalizedNewEmail = newEmail.value.trim().toLowerCase()
  const normalizedConfirmEmail = confirmNewEmail.value.trim().toLowerCase()

  if (!normalizedNewEmail || !normalizedConfirmEmail) {
    emailChangeError.value = 'Please enter your new email twice.'
    return
  }

  if (normalizedNewEmail !== normalizedConfirmEmail) {
    emailChangeError.value = 'Email addresses do not match.'
    return
  }

  if (normalizedNewEmail === user.value.email.toLowerCase()) {
    emailChangeError.value = 'Please enter a different email address.'
    return
  }

  if (!isValidEmail(normalizedNewEmail)) {
    emailChangeError.value = 'Please enter a valid email address.'
    return
  }

  emailChangeLoading.value = true

  try {
    const origin = import.meta.client ? window.location.origin : undefined
    const redirectUrl = origin
      ? `${origin.replace(/\/$/, '')}/auth/confirm`
      : undefined

    const { error } = await supabase.auth.updateUser(
      { email: normalizedNewEmail },
      redirectUrl ? { emailRedirectTo: redirectUrl } : undefined,
    )

    if (error)
      throw error

    emailChangeSent.value = true
    newEmail.value = ''
    confirmNewEmail.value = ''
  }
  catch (error) {
    emailChangeError.value = error instanceof Error ? error.message : 'Unable to request email change.'
  }
  finally {
    emailChangeLoading.value = false
  }
}
</script>

<template>
  <Card separators>
    <template #header>
      <Flex x-between y-center>
        <h3>Change Email</h3>
        <Icon name="ph:envelope-simple" />
      </Flex>
    </template>

    <Flex column gap="m">
      <p class="text-s text-color-lighter">
        Update your login email. We will send confirmation links to both your current and new addresses.
      </p>
      <div class="current-email-block">
        <span class="text-xs text-color-lighter">Current Email</span>
        <p class="text-s">
          {{ user?.email || 'No email on file' }}
        </p>
      </div>
      <Input
        v-model="newEmail"
        label="New Email"
        placeholder="new.email@example.com"
        type="email"
        expand
      />
      <Input
        v-model="confirmNewEmail"
        label="Confirm New Email"
        placeholder="Confirm new email"
        type="email"
        expand
      />
      <Button :expand="isBelowSmall" :loading="emailChangeLoading" variant="accent" @click="requestEmailChange">
        Send Email Change Links
      </Button>
      <Alert v-if="emailChangeSent" filled variant="info">
        Check both your current and new inboxes to confirm the change.
      </Alert>
      <Alert v-if="emailChangeError" filled variant="danger">
        {{ emailChangeError }}
      </Alert>
    </Flex>
  </Card>
</template>

<style scoped>
.current-email-block {
  line-height: 1.4;
}
</style>
