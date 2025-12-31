<script setup lang="ts">
import { Alert, Button, Card, Flex, Input, pushToast } from '@dolanske/vui'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const supabase = useSupabaseClient()
const user = useSupabaseUser()

const deleteAccountConfirm = ref('')
const deleteAccountLoading = ref(false)
const deleteAccountError = ref('')
const deleteAccountModalOpen = ref(false)

const isBelowSmall = useBreakpoint('<s')

function validateDeleteAccountInput(): boolean {
  deleteAccountError.value = ''

  if (!user.value?.email) {
    deleteAccountError.value = 'No email found for your account.'
    return false
  }

  if (!deleteAccountConfirm.value) {
    deleteAccountError.value = 'Please confirm your current email to continue.'
    return false
  }

  const normalizedConfirm = deleteAccountConfirm.value.trim().toLowerCase()
  const normalizedCurrent = user.value.email.toLowerCase()

  if (normalizedConfirm !== normalizedCurrent) {
    deleteAccountError.value = 'Confirmation email does not match your current email.'
    return false
  }

  return true
}

function promptDeleteAccount() {
  if (validateDeleteAccountInput())
    deleteAccountModalOpen.value = true
}

async function deleteAccount() {
  if (!validateDeleteAccountInput())
    return

  deleteAccountLoading.value = true

  try {
    const { error } = await supabase.functions.invoke('user-delete-account', {
      body: {
        confirmEmail: deleteAccountConfirm.value.trim(),
      },
    })

    if (error)
      throw error

    pushToast('Account deleted successfully. Goodbye!')
    deleteAccountConfirm.value = ''

    await supabase.auth.signOut()
    navigateTo('/')
  }
  catch (error) {
    deleteAccountError.value = error instanceof Error ? error.message : 'Unable to delete account.'
  }
  finally {
    deleteAccountLoading.value = false
  }
}
</script>

<template>
  <Card separators class="danger-card card-bg">
    <template #header>
      <Flex column gap="xxs">
        <h4 class="danger-text">
          Delete Account
        </h4>
        <p class="text-s danger-text">
          Deleting your account removes your profile, connected accounts, and access to Hivecom services. This action cannot be undone.
        </p>
      </Flex>
    </template>

    <Flex column gap="l">
      <Input
        v-model="deleteAccountConfirm"
        hint="Type your current email to confirm you understand the consequences."
        label="Confirm Email"
        placeholder="your.email@example.com"
        type="email"
        expand
      />

      <Alert v-if="deleteAccountError" filled variant="danger">
        {{ deleteAccountError }}
      </Alert>
    </Flex>

    <template #footer>
      <Button
        variant="danger"
        :expand="isBelowSmall"
        :loading="deleteAccountLoading"
        :disabled="!deleteAccountConfirm || deleteAccountConfirm.toLowerCase() !== (user?.email || '').toLowerCase()"
        @click="promptDeleteAccount"
      >
        Permanently Delete Account
      </Button>
    </template>
  </Card>

  <ConfirmModal
    v-model:open="deleteAccountModalOpen"
    :confirm="deleteAccount"
    title="Delete Account"
    description="This will permanently remove your Hivecom account, connected identities, and any associated data. This action cannot be undone."
    confirm-text="Delete Account"
    cancel-text="Cancel"
    :destructive="true"
  />
</template>

<style scoped>
.danger-card {
  border-color: var(--color-danger, #ff424d);
}

.danger-text {
  color: var(--color-danger, #ff424d);
}
</style>
