<script setup lang="ts">
import type { Session } from '@supabase/supabase-js'
import { Alert, Button, Card, Flex, OTP, OTPItem, pushToast, Skeleton } from '@dolanske/vui'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { useCacheMfaStatus } from '@/composables/useCacheMfaStatus'
import { useCacheUserData } from '@/composables/useCacheUserData'
import { useUserId } from '@/composables/useUserId'
import { useBreakpoint } from '@/lib/mediaQuery'
import TinyBadge from '../Shared/TinyBadge.vue'

interface MfaFactor {
  id: string
  factor_type: 'totp' | 'phone' | 'webauthn'
  status: 'verified' | 'unverified'
  friendly_name?: string | null
}

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const isClient = import.meta.client
const userId = useUserId()

const isBelowSmall = useBreakpoint('<s')

const { user: currentUserData } = useCacheUserData(userId, {
  includeRole: true,
  includeAvatar: false,
})

const mfaLoading = ref(false)
const mfaError = ref('')
const totpError = ref('')
const totpSuccess = ref('')
const disableTotpError = ref('')
const mfaFactors = ref<MfaFactor[]>([])
const disableTotpModalOpen = ref(false)
const disableTotpLoading = ref(false)
const totpSetup = reactive({
  factorId: '',
  qrCode: '',
  secret: '',
  uri: '',
  code: '',
  enrolling: false,
  verifying: false,
})
const mfaCache = useCacheMfaStatus()

const hasMfaSupport = computed(() => Boolean((supabase.auth as unknown as { mfa?: unknown }).mfa))
const verifiedTotpFactor = computed(() => mfaFactors.value.find(f => f.factor_type === 'totp' && f.status === 'verified') || null)
const hasVerifiedTotp = computed(() => Boolean(verifiedTotpFactor.value))
const isTotpSetupActive = computed(() => Boolean(totpSetup.qrCode && totpSetup.secret))
const mfaStatusCopy = computed(() => (hasVerifiedTotp.value
  ? 'Authenticator codes are required the next time you sign in.'
  : 'Set up an authenticator app to add two-factor authentication.'))
const hasElevatedRole = computed(() => {
  const role = currentUserData.value?.role
  return role === 'admin' || role === 'moderator'
})

const mfaStatusBadge = computed(() => {
  if (hasVerifiedTotp.value)
    return { variant: 'success' as const, label: 'Protected' }

  return hasElevatedRole.value
    ? { variant: 'warning' as const, label: 'Recommended for your role' }
    : { variant: 'warning' as const, label: 'Recommended' }
})
const mfaStatusIcon = computed(() => (hasVerifiedTotp.value ? 'ph:shield-check' : 'ph:shield-warning'))

function resolveErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function resetTotpSetup() {
  totpSetup.factorId = ''
  totpSetup.qrCode = ''
  totpSetup.secret = ''
  totpSetup.uri = ''
  totpSetup.code = ''
  totpSetup.enrolling = false
  totpSetup.verifying = false
}

async function loadMfaFactors() {
  if (!isClient) {
    return
  }

  if (!user.value) {
    mfaFactors.value = []
    mfaError.value = ''
    resetTotpSetup()
    return
  }

  if (!hasMfaSupport.value) {
    mfaError.value = 'Multi-factor authentication requires a newer version of the Supabase client.'
    return
  }

  mfaLoading.value = true
  mfaError.value = ''

  try {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error)
      throw error
    const factors = Array.isArray(data?.all) ? data.all : []
    mfaFactors.value = factors as MfaFactor[]
  }
  catch (error) {
    mfaError.value = resolveErrorMessage(error, 'Unable to load multi-factor status.')
  }
  finally {
    mfaLoading.value = false
  }
}

async function cleanupPendingTotpFactor() {
  const pendingFactor = mfaFactors.value.find(f => f.factor_type === 'totp' && f.status === 'unverified')
  if (!pendingFactor)
    return

  const { error } = await supabase.auth.mfa.unenroll({ factorId: pendingFactor.id })
  if (error)
    throw error

  mfaFactors.value = mfaFactors.value.filter(f => f.id !== pendingFactor.id)
}

async function startTotpEnrollment() {
  if (totpSetup.enrolling || !user.value)
    return

  if (!hasMfaSupport.value) {
    mfaError.value = 'Multi-factor authentication is not supported in this environment.'
    return
  }

  totpSetup.enrolling = true
  totpError.value = ''
  totpSuccess.value = ''

  try {
    await loadMfaFactors()
    await cleanupPendingTotpFactor()

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'Hivecom',
    })

    if (error)
      throw error

    if (!data?.id || !data.totp?.qr_code) {
      throw new Error('Unable to fetch QR code details from Supabase.')
    }

    totpSetup.factorId = data.id
    totpSetup.qrCode = data.totp.qr_code
    totpSetup.secret = data.totp.secret ?? ''
    totpSetup.uri = data.totp.uri ?? ''
    totpSetup.code = ''

    await loadMfaFactors()
  }
  catch (error) {
    totpError.value = resolveErrorMessage(error, 'Unable to start authenticator setup.')
  }
  finally {
    totpSetup.enrolling = false
  }
}

async function cancelTotpEnrollment() {
  totpError.value = ''
  totpSuccess.value = ''

  if (!totpSetup.factorId) {
    resetTotpSetup()
    return
  }

  try {
    await supabase.auth.mfa.unenroll({ factorId: totpSetup.factorId })
    resetTotpSetup()
    await loadMfaFactors()
  }
  catch (error) {
    totpError.value = resolveErrorMessage(error, 'Unable to cancel authenticator setup.')
  }
}

async function verifyTotpEnrollment() {
  if (!totpSetup.factorId) {
    totpError.value = 'Start the authenticator setup before verifying.'
    return
  }

  const code = totpSetup.code.trim()
  if (!code) {
    totpError.value = 'Enter the 6-digit code from your authenticator app.'
    return
  }

  totpSetup.verifying = true
  totpError.value = ''

  try {
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: totpSetup.factorId,
      code,
    })

    if (error)
      throw error

    const { data: sessionResult, error: sessionError } = await supabase.auth.getSession()
    if (sessionError)
      console.warn('Unable to fetch upgraded MFA session:', sessionError)

    await persistVerifiedMfaSession(sessionResult?.session ?? null)
    totpSuccess.value = 'Authenticator app confirmed. MFA is now enabled.'
    pushToast('Multi-factor authentication enabled.')
    resetTotpSetup()
    await loadMfaFactors()
  }
  catch (error) {
    totpError.value = resolveErrorMessage(error, 'Unable to verify the provided code. Double-check it and try again.')
  }
  finally {
    totpSetup.verifying = false
  }
}

async function disableTotp() {
  if (!verifiedTotpFactor.value)
    return

  disableTotpError.value = ''
  totpSuccess.value = ''
  disableTotpLoading.value = true

  try {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: verifiedTotpFactor.value.id })
    if (error)
      throw error

    pushToast('Multi-factor authentication disabled.')
    await loadMfaFactors()
    mfaCache.value = { currentLevel: null, nextLevel: null, fetchedAt: 0 }
  }
  catch (error) {
    disableTotpError.value = resolveErrorMessage(error, 'Unable to disable multi-factor authentication right now.')
  }
  finally {
    disableTotpLoading.value = false
  }
}

async function persistVerifiedMfaSession(session: Session | null) {
  if (!session)
    return

  try {
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    })

    mfaCache.value = {
      currentLevel: 'aal2',
      nextLevel: 'aal2',
      fetchedAt: Date.now(),
    }
  }
  catch (error) {
    console.error('Unable to persist upgraded MFA session:', error)
  }
}

watch(user, (newUser) => {
  if (newUser)
    loadMfaFactors()
  else
    resetTotpSetup()
})

watch(
  () => totpSetup.code,
  (code) => {
    const normalized = code.trim()
    if (normalized.length === 6 && !totpSetup.verifying)
      void verifyTotpEnrollment()
  },
)

onMounted(() => {
  if (user.value)
    loadMfaFactors()
})
</script>

<template>
  <Card separators>
    <template #header>
      <Flex x-between y-center>
        <h3>Multi-Factor Authentication</h3>
        <Icon name="ph:shield-check" />
      </Flex>
    </template>

    <Flex column gap="l">
      <template v-if="hasMfaSupport">
        <Flex v-if="mfaLoading" column gap="s">
          <Skeleton width="50%" height="1rem" />
          <Skeleton width="100%" height="3.5rem" />
        </Flex>

        <template v-else>
          <Flex class="security-panel" gap="l" wrap>
            <Flex gap="m" y-start class="security-panel__content">
              <div class="security-panel__icon" :class="{ 'is-active': hasVerifiedTotp }">
                <Icon :name="mfaStatusIcon" size="28" />
              </div>
              <Flex column gap="xs">
                <Flex gap="s" y-center wrap>
                  <strong>{{ hasVerifiedTotp ? 'Enabled' : 'Not Enabled' }}</strong>
                  <TinyBadge :variant="mfaStatusBadge.variant">
                    <Icon :class="`text-color-${mfaStatusBadge.variant === 'success' ? 'accent' : 'red'}`" :name="mfaStatusIcon" />
                    {{ mfaStatusBadge.label }}
                  </TinyBadge>
                </Flex>
                <p class="text-s text-color-lighter">
                  {{ mfaStatusCopy }}
                </p>
              </Flex>
            </Flex>
            <Flex expand column gap="s" class="security-panel__actions">
              <Button
                v-if="hasVerifiedTotp"
                variant="danger"
                :expand="isBelowSmall"
                :loading="disableTotpLoading"
                @click="disableTotpModalOpen = true"
              >
                Disable Authenticator
              </Button>
              <Button
                v-else
                variant="accent"
                :expand="isBelowSmall"
                :loading="totpSetup.enrolling"
                :disabled="isTotpSetupActive"
                @click="startTotpEnrollment"
              >
                Set Up Authenticator App
              </Button>
            </Flex>
          </Flex>

          <div v-if="isTotpSetupActive" class="mfa-setup">
            <Flex gap="m" wrap>
              <div class="qr-wrapper">
                <img :src="totpSetup.qrCode" alt="Authenticator QR code">
              </div>
              <Flex column class="setup-instructions" gap="s">
                <div>
                  <p class="text-s">
                    Scan the QR code or enter this key manually in your authenticator app.
                  </p>
                  <div class="secret-block">
                    {{ totpSetup.secret || 'No secret available' }}
                  </div>
                </div>
                <p class="text-xs text-color-lighter">
                  After adding the account, enter the 6-digit code below to confirm setup.
                </p>
                <Flex column gap="xs">
                  <span class="text-xs text-color-lighter">One-time code</span>
                  <OTP
                    v-model="totpSetup.code"
                    mode="num"
                    :disabled="totpSetup.verifying"
                  >
                    <OTPItem :i="0" />
                    <OTPItem :i="1" />
                    <OTPItem :i="2" />
                    <div class="otp-divider">
                      -
                    </div>
                    <OTPItem :i="3" />
                    <OTPItem :i="4" />
                    <OTPItem :i="5" />
                  </OTP>
                </Flex>
                <Flex gap="s" :column="isBelowSmall" :row="!isBelowSmall" :expand="isBelowSmall">
                  <Button :expand="isBelowSmall" variant="accent" :loading="totpSetup.verifying" @click="verifyTotpEnrollment">
                    Verify Code
                  </Button>
                  <Button :expand="isBelowSmall" :disabled="totpSetup.verifying" @click="cancelTotpEnrollment">
                    Cancel
                  </Button>
                </Flex>
              </Flex>
            </Flex>
          </div>
        </template>
      </template>
      <Alert v-else filled variant="warning">
        Your current frontend build does not support authenticator-based MFA. Update @nuxtjs/supabase to enable it.
      </Alert>
      <Alert v-if="mfaError" filled variant="danger">
        {{ mfaError }}
      </Alert>
      <Alert v-if="totpError" filled variant="danger">
        {{ totpError }}
      </Alert>
      <Alert v-if="disableTotpError" filled variant="danger">
        {{ disableTotpError }}
      </Alert>
    </Flex>
  </Card>

  <ConfirmModal
    v-model:open="disableTotpModalOpen"
    :confirm="disableTotp"
    title="Disable Authenticator"
    description="You will no longer be prompted for a one-time code when signing in. Are you sure you want to disable MFA?"
    confirm-text="Disable MFA"
    cancel-text="Keep Enabled"
    :destructive="true"
  />
</template>

<style scoped>
.security-panel {
  width: 100%;
  padding: var(--space-l);
  border-radius: var(--border-radius-l);
  border: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.security-panel__content {
  flex: 1;
  min-width: 240px;
}

.security-panel__icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--color-bg, #0e1018);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
}

.security-panel__icon.is-active {
  border-color: var(--color-accent);
}

.security-panel__actions {
  min-width: 220px;
  flex-shrink: 0;
}

.mfa-setup {
  padding: var(--space-m);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  background: var(--color-bg-subtle);
}

.mfa-benefits {
  padding: var(--space-m) var(--space-l);
  border-radius: var(--border-radius-m);
  border: 1px dashed var(--color-border);
  background: var(--color-bg);
}

.qr-wrapper {
  width: 160px;
  min-width: 160px;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  background: white;
  padding: var(--space-xs);
}

.qr-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.setup-instructions {
  flex: 1;
  min-width: 220px;
}

.secret-block {
  padding: var(--space-xs) var(--space-s);
  border: 1px dashed var(--color-border);
  border-radius: var(--border-radius-s);
  font-family: var(--font-family-mono, 'Courier New', Courier, monospace);
  word-break: break-all;
  background: var(--color-bg, #0e1018);
}

.otp-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 var(--space-m);
  color: var(--color-text-light);
}
</style>
