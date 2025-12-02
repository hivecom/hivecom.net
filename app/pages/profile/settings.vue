<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Alert, Badge, Button, Card, Flex, Input, pushToast, Skeleton, Toasts } from '@dolanske/vui'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import SharedErrorToast from '@/components/Shared/ErrorToast.vue'

// Async component
const ConnectPatreonButton = defineAsyncComponent(() => import('@/components/Profile/ConnectPatreon.vue'))
const ConnectDiscord = defineAsyncComponent(() => import('@/components/Profile/ConnectDiscord.vue'))
const ConnectSteam = defineAsyncComponent(() => import('@/components/Profile/ConnectSteam.vue'))

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const userId = useUserId()

const profile = ref<Tables<'profiles'> | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const authReady = ref(false)
const disconnectLoading = reactive({
  patreon: false,
  discord: false,
})

// Password reset state
const passwordResetLoading = ref(false)
const passwordResetSent = ref(false)
const passwordResetError = ref('')

// Email change state
const newEmail = ref('')
const confirmNewEmail = ref('')
const emailChangeLoading = ref(false)
const emailChangeSent = ref(false)
const emailChangeError = ref('')
const deleteAccountConfirm = ref('')
const deleteAccountLoading = ref(false)
const deleteAccountError = ref('')
const deleteAccountModalOpen = ref(false)

function isValidEmail(value: string): boolean {
  const [local, domain, ...rest] = value.split('@')
  if (!local || !domain || rest.length > 0)
    return false
  if (domain.startsWith('.') || domain.endsWith('.'))
    return false
  return domain.includes('.')
}

function showErrorToast(message: string) {
  pushToast('', {
    body: SharedErrorToast,
    bodyProps: {
      error: message,
    },
  })
}

async function sendPasswordReset() {
  passwordResetLoading.value = true
  passwordResetError.value = ''
  passwordResetSent.value = false
  try {
    if (!user.value?.email) {
      passwordResetError.value = 'No email found for your account.'
      return
    }
    const redirectUrl = process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000/auth/confirm'
      : `${window.location.origin}/auth/confirm`
    const { error } = await supabase.auth.resetPasswordForEmail(user.value.email, { redirectTo: redirectUrl })
    if (error) {
      passwordResetError.value = error.message
    }
    else {
      passwordResetSent.value = true
    }
  }
  catch (err) {
    passwordResetError.value = err instanceof Error ? err.message : 'An error occurred.'
  }
  finally {
    passwordResetLoading.value = false
  }
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
    const { error } = await supabase.functions.invoke('user-change-email', {
      body: {
        newEmail: normalizedNewEmail,
        origin,
      },
    })

    if (error)
      throw error

    emailChangeSent.value = true
    newEmail.value = ''
    confirmNewEmail.value = ''
  }
  catch (error: unknown) {
    emailChangeError.value = error instanceof Error ? error.message : 'Unable to request email change.'
  }
  finally {
    emailChangeLoading.value = false
  }
}

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
  catch (error: unknown) {
    deleteAccountError.value = error instanceof Error ? error.message : 'Unable to delete account.'
  }
  finally {
    deleteAccountLoading.value = false
  }
}

// Authentication check - redirect if not signed in
onMounted(() => {
  const authListener = supabase.auth.onAuthStateChange((event, _session) => {
    authReady.value = true

    if (event === 'SIGNED_OUT' || (!user.value && authReady.value)) {
      navigateTo('/auth/sign-in')
    }
  })

  // Cleanup listener on component unmount
  onUnmounted(() => {
    authListener.data.subscription.unsubscribe()
  })

  // Try to determine auth state immediately if user is already available
  if (user.value) {
    authReady.value = true
    fetchProfile()
  }
  else {
    // Set a timeout to check if we're still loading after a reasonable time
    setTimeout(() => {
      if (!user.value && authReady.value) {
        navigateTo('/auth/sign-in')
      }
    }, 1000)
  }
})

// Watch for user changes
watch(user, (newUser) => {
  if (!newUser && authReady.value) {
    navigateTo('/auth/sign-in')
  }
  else if (newUser) {
    fetchProfile()
  }
})

// Fetch user's profile data
async function fetchProfile() {
  if (!user.value) {
    loading.value = false
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId.value)
      .single()

    if (error) {
      throw error
    }

    profile.value = data
  }
  catch (error: unknown) {
    console.error('Error fetching profile:', error)
    errorMessage.value = (error as Error).message || 'Failed to load profile'
  }
  finally {
    loading.value = false
  }
}

async function disconnectPatreon() {
  if (disconnectLoading.patreon)
    return

  disconnectLoading.patreon = true
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error)
      throw error
    if (!user)
      throw new Error('You must be signed in to disconnect Patreon.')

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        patreon_id: null,
        supporter_patreon: false,
      })
      .eq('id', user.id)

    if (updateError)
      throw updateError

    if (profile.value)
      profile.value = { ...profile.value, patreon_id: null, supporter_patreon: false }

    pushToast('Patreon disconnected successfully.')
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to disconnect Patreon.'
    showErrorToast(message)
  }
  finally {
    disconnectLoading.patreon = false
  }
}

async function disconnectDiscord() {
  if (disconnectLoading.discord)
    return

  disconnectLoading.discord = true
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error)
      throw error
    if (!user)
      throw new Error('You must be signed in to disconnect Discord.')

    const discordIdentity = user.identities?.find(identity => identity.provider === 'discord')
    if (discordIdentity) {
      const identityId = ('identity_id' in discordIdentity && discordIdentity.identity_id)
        || discordIdentity.id

      if (!identityId)
        throw new Error('Unable to resolve Discord identity.')

      const { error: unlinkError } = await supabase.auth.unlinkIdentity(discordIdentity)
      if (unlinkError)
        throw unlinkError
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ discord_id: null })
      .eq('id', user.id)

    if (updateError)
      throw updateError

    if (profile.value)
      profile.value = { ...profile.value, discord_id: null }

    pushToast('Discord disconnected successfully.')
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to disconnect Discord.'
    showErrorToast(message)
  }
  finally {
    disconnectLoading.discord = false
  }
}
</script>

<template>
  <div class="page">
    <template v-if="loading && !authReady">
      <div class="loading-container">
        <Skeleton height="2.5rem" width="60%" style="margin-bottom: var(--space-l);" />

        <Card separators>
          <template #header>
            <Flex x-between y-center>
              <Skeleton height="1.5rem" width="10rem" />
              <Skeleton width="1.5rem" height="1.5rem" />
            </Flex>
          </template>

          <Flex column gap="m">
            <!-- Account connection row skeletons -->
            <div v-for="i in 3" :key="i" class="account-connection-row">
              <Flex x-between y-center expand>
                <Flex gap="m" y-center>
                  <Skeleton width="40px" height="40px" style="border-radius: var(--border-radius-m);" />
                  <div>
                    <Skeleton height="1.2rem" width="6rem" style="margin-bottom: var(--space-xs);" />
                    <Skeleton height="0.8rem" width="12rem" />
                  </div>
                </Flex>
                <Skeleton height="2rem" width="5rem" style="border-radius: 1rem;" />
              </Flex>
            </div>
          </Flex>
        </Card>
      </div>
    </template>

    <template v-else-if="!user">
      <div>Please sign in to access profile settings.</div>
    </template>

    <template v-else>
      <!-- Hero section -->
      <section class="page-title">
        <h1>
          Settings
        </h1>
        <p>
          Manage your account settings and connected accounts.
        </p>
      </section>

      <Flex class="settings-row" gap="l" wrap>
        <Flex class="settings-column" column gap="l">
          <!-- Change Password Section -->
          <Card separators>
            <template #header>
              <Flex x-between y-center>
                <h3>Change Password</h3>
                <Icon name="ph:key" />
              </Flex>
            </template>
            <Flex column gap="m">
              <p class="text-s text-color-lighter">
                You can set or change your password to log in with email and password instead of just email links.
              </p>
              <Button :loading="passwordResetLoading" variant="accent" @click="sendPasswordReset">
                Send Password Reset Email
              </Button>
              <Alert v-if="passwordResetSent" filled variant="info">
                A password reset link has been sent to your email address.
              </Alert>
              <Alert v-if="passwordResetError" filled variant="danger">
                {{ passwordResetError }}
              </Alert>
            </Flex>
          </Card>

          <!-- Change Email Section -->
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
              <Button :loading="emailChangeLoading" variant="accent" @click="requestEmailChange">
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

          <!-- Delete Account Section -->
          <Card separators class="danger-card">
            <template #header>
              <Flex x-between y-center>
                <h3>Delete Account</h3>
                <Icon name="ph:warning" />
              </Flex>
            </template>
            <Flex column gap="m">
              <p class="text-s danger-text">
                Deleting your account removes your profile, connected accounts, and access to Hivecom services. This action cannot be undone.
              </p>
              <p class="text-xs text-color-lighter">
                Type your current email to confirm you understand the consequences.
              </p>
              <Input
                v-model="deleteAccountConfirm"
                label="Confirm Email"
                placeholder="your.email@example.com"
                type="email"
                expand
              />
              <Button
                variant="danger"
                :loading="deleteAccountLoading"
                :disabled="!deleteAccountConfirm || deleteAccountConfirm.toLowerCase() !== (user?.email || '').toLowerCase()"
                @click="promptDeleteAccount"
              >
                Permanently Delete Account
              </Button>
              <Alert v-if="deleteAccountError" filled variant="danger">
                {{ deleteAccountError }}
              </Alert>
            </Flex>
          </Card>
        </Flex>

        <Flex class="settings-column" column>
          <!-- Connected Accounts Section -->
          <Card separators class="connected-card">
            <template #header>
              <Flex x-between y-center>
                <h3>Connected Accounts</h3>
                <Icon name="ph:link" />
              </Flex>
            </template>

            <Flex column gap="m">
              <!-- Patreon -->
              <Flex expand class="account-connection-row">
                <Flex x-between y-center expand>
                  <Flex gap="m" y-center>
                    <div class="account-icon patreon">
                      <Icon name="ph:patreon-logo" size="20" />
                    </div>
                    <div>
                      <strong>Patreon</strong>
                      <p class="text-xs text-color-lighter">
                        Support the community and get supporter benefits
                      </p>
                    </div>
                  </Flex>

                  <div class="account-status">
                    <Flex v-if="profile?.patreon_id" gap="s" y-center>
                      <Badge variant="success" size="s">
                        <Icon name="ph:check" />
                        Connected
                      </Badge>
                      <Button variant="danger" :loading="disconnectLoading.patreon" @click="disconnectPatreon">
                        Disconnect
                      </Button>
                    </Flex>
                    <ClientOnly v-else>
                      <ConnectPatreonButton />
                    </ClientOnly>
                  </div>
                </Flex>
              </Flex>

              <!-- Steam -->
              <Flex expand class="account-connection-row">
                <Flex x-between y-center expand>
                  <Flex gap="m" y-center>
                    <div class="account-icon steam">
                      <Icon name="ph:game-controller" size="20" />
                    </div>
                    <div>
                      <strong>Steam</strong>
                      <p class="text-xs text-color-lighter">
                        Connect your gaming profile
                      </p>
                    </div>
                  </Flex>

                  <div class="account-status">
                    <Badge v-if="profile?.steam_id" variant="success" size="s">
                      <Icon name="ph:check" />
                      Connected
                    </Badge>
                    <ClientOnly v-else>
                      <ConnectSteam />
                    </ClientOnly>
                  </div>
                </Flex>
              </Flex>

              <!-- Discord -->
              <Flex expand class="account-connection-row">
                <Flex x-between y-center expand>
                  <Flex gap="m" y-center>
                    <div class="account-icon discord">
                      <Icon name="ph:discord-logo" size="20" />
                    </div>
                    <div>
                      <strong>Discord</strong>
                      <p class="text-xs text-color-lighter">
                        Sign-in through Discord
                      </p>
                    </div>
                  </Flex>

                  <div class="account-status">
                    <Flex v-if="profile?.discord_id" gap="s" y-center>
                      <Badge variant="success" size="s">
                        <Icon name="ph:check" />
                        Connected
                      </Badge>
                      <Button variant="danger" :loading="disconnectLoading.discord" @click="disconnectDiscord">
                        Disconnect
                      </Button>
                    </Flex>
                    <ClientOnly v-else>
                      <ConnectDiscord @linked="fetchProfile" />
                    </ClientOnly>
                  </div>
                </Flex>
              </Flex>
            </Flex>
          </Card>
        </Flex>
      </Flex>
    </template>
  </div>
  <Toasts />
  <ConfirmModal
    v-model:open="deleteAccountModalOpen"
    v-model:confirm="deleteAccount"
    title="Delete Account"
    description="This will permanently remove your Hivecom account, connected identities, and any associated data. This action cannot be undone."
    confirm-text="Delete Account"
    cancel-text="Cancel"
    :destructive="true"
  />
</template>

<style lang="scss" scoped>
.settings-title {
  margin-bottom: var(--space-l);
  color: var(--text-color);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
}

.settings-row {
  margin-bottom: var(--space-l);
}

.settings-column {
  flex: 1 1 360px;
  min-width: 280px;
}

.current-email-block {
  line-height: 1.4;
}

.danger-card {
  border-color: var(--color-danger, #ff424d);
}

.danger-text {
  color: var(--color-danger, #ff424d);
}

.loading-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
  padding: var(--space-xl);
}

.account-connection-row {
  padding: var(--space-m);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  background: var(--color-bg-subtle);

  .account-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--border-radius-m);
    flex-shrink: 0;

    &.patreon {
      background: linear-gradient(135deg, #ff424d 0%, #ff8a00 100%);
      color: white;
    }

    &.steam {
      background: linear-gradient(135deg, #171a21 0%, #2a475e 100%);
      color: white;
    }

    &.discord {
      background: linear-gradient(135deg, #5865f2 0%, #7289da 100%);
      color: white;
    }
  }

  .account-status {
    flex-shrink: 0;
  }
}

@media (max-width: 768px) {
  .profile-settings {
    padding: var(--space-m);
  }

  .account-connection-row {
    padding: var(--space-s);

    .account-icon {
      width: 32px;
      height: 32px;
    }
  }
}
</style>
