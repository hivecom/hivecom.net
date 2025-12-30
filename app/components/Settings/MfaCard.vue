<script setup lang="ts">
import type { Session } from '@supabase/supabase-js'
import { Alert, Button, Card, Flex, Input, OTP, OTPItem, pushToast, Skeleton } from '@dolanske/vui'
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
  created_at?: string
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
const mfaHasFetched = ref(false)
const mfaError = ref('')
const totpError = ref('')
const totpSuccess = ref('')
const mfaFactors = ref<MfaFactor[]>([])
const removeFactorError = ref('')
const removeFactorModalOpen = ref(false)
const removeFactorLoading = ref(false)
const removeFactorTarget = ref<MfaFactor | null>(null)
const totpSetup = reactive({
  factorId: '',
  qrCode: '',
  secret: '',
  uri: '',
  code: '',
  friendlyName: '',
  enrolling: false,
  verifying: false,
})
const mfaCache = useCacheMfaStatus()

const hasMfaSupport = computed(() => Boolean((supabase.auth as unknown as { mfa?: unknown }).mfa))
const showMfaSkeleton = computed(() => hasMfaSupport.value && Boolean(user.value) && (mfaLoading.value || !mfaHasFetched.value))
const hasVerifiedTotp = computed(() => mfaFactors.value.some(f => f.factor_type === 'totp' && f.status === 'verified'))
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

function factorTypeLabel(factorType: MfaFactor['factor_type']) {
  if (factorType === 'totp')
    return 'Authenticator app'
  if (factorType === 'phone')
    return 'Phone'
  return 'Security key'
}

function factorDisplayName(factor: MfaFactor, fallbackIndex: number) {
  const friendly = factor.friendly_name?.trim()
  if (friendly)
    return friendly
  return `${factorTypeLabel(factor.factor_type)} ${fallbackIndex + 1}`
}

function formatFactorDate(value?: string) {
  if (!value)
    return ''

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()))
    return ''

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(parsed)
}

function nextTotpFriendlyName() {
  const takenNames = new Set(
    mfaFactors.value
      .map(factor => factor.friendly_name?.trim())
      .filter((name): name is string => Boolean(name)),
  )

  const existingTotpCount = mfaFactors.value.filter(factor => factor.factor_type === 'totp').length
  let index = Math.max(1, existingTotpCount + 1)

  while (takenNames.has(`Authenticator app ${index}`))
    index++

  return `Authenticator app ${index}`
}

function isFriendlyNameTaken(name: string) {
  const normalized = name.trim()
  if (!normalized)
    return false

  const normalizedKey = normalized.toLocaleLowerCase()
  return mfaFactors.value.some(factor => (factor.friendly_name?.trim() ?? '').toLocaleLowerCase() === normalizedKey)
}

function resetTotpSetup() {
  totpSetup.factorId = ''
  totpSetup.qrCode = ''
  totpSetup.secret = ''
  totpSetup.uri = ''
  totpSetup.code = ''
  totpSetup.friendlyName = ''
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
    mfaHasFetched.value = true
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

    const requestedName = totpSetup.friendlyName.trim()
    const friendlyName = requestedName || nextTotpFriendlyName()

    if (isFriendlyNameTaken(friendlyName)) {
      totpError.value = 'A device with this name already exists. Choose a different name.'
      return
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'Hivecom',
      friendlyName,
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
    totpSetup.friendlyName = friendlyName

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

function requestRemoveFactor(factor: MfaFactor) {
  removeFactorTarget.value = factor
  removeFactorModalOpen.value = true
  removeFactorError.value = ''
  totpSuccess.value = ''
}

const removeFactorTitle = computed(() => {
  const factor = removeFactorTarget.value
  if (!factor)
    return 'Remove MFA device'

  if (factor.status === 'unverified')
    return 'Remove pending setup'

  return 'Remove MFA device'
})

const removeFactorDescription = computed(() => {
  const factor = removeFactorTarget.value
  if (!factor)
    return 'Remove this multi-factor authentication device?'

  if (factor.status === 'unverified')
    return 'This authenticator setup has not been verified yet. Removing it will cancel the setup.'

  return 'Removing this device will stop it from being usable for future sign-ins.'
})

async function removeSelectedFactor() {
  const factor = removeFactorTarget.value
  if (!factor)
    return

  removeFactorError.value = ''
  totpSuccess.value = ''
  removeFactorLoading.value = true

  try {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    if (error)
      throw error

    if (factor.id === totpSetup.factorId)
      resetTotpSetup()

    pushToast('MFA device removed.')
    await loadMfaFactors()
    mfaCache.value = { currentLevel: null, nextLevel: null, fetchedAt: 0 }
    removeFactorModalOpen.value = false
    removeFactorTarget.value = null
  }
  catch (error) {
    removeFactorError.value = resolveErrorMessage(error, 'Unable to remove this MFA device right now.')
  }
  finally {
    removeFactorLoading.value = false
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
  <Card separators class="card-bg">
    <template #header>
      <Flex x-between y-center>
        <h4>Multi-Factor Authentication</h4>
        <Icon :name="mfaStatusIcon" />
      </Flex>
    </template>

    <Flex column gap="l">
      <template v-if="hasMfaSupport">
        <Flex v-if="showMfaSkeleton" column gap="m" expand>
          <Flex class="security-panel" gap="l" wrap expand>
            <Flex gap="m" y-start class="security-panel__content">
              <div class="security-panel__icon">
                <Skeleton width="28px" height="28px" />
              </div>
              <Flex column gap="xs" expand>
                <Skeleton width="32%" height="1rem" />
                <Skeleton width="72%" height="0.95rem" />
                <Skeleton width="56%" height="0.95rem" />
              </Flex>
            </Flex>
            <Flex expand :column="isBelowSmall" gap="s" class="security-panel__actions">
              <Skeleton :width="isBelowSmall ? '100%' : '50%'" height="2.25rem" />
              <Skeleton :width="isBelowSmall ? '100%' : '50%'" height="2.25rem" />
            </Flex>
          </Flex>

          <div class="w-100">
            <Flex column gap="s" expand>
              <Flex x-between y-center wrap expand>
                <Skeleton width="120px" height="1rem" />
                <Skeleton width="90px" height="0.9rem" />
              </Flex>

              <Flex column gap="xs" class="device-list" expand>
                <Flex
                  v-for="i in 2"
                  :key="i"
                  expand
                  class="device-row"
                  x-between
                  y-center
                  wrap
                >
                  <Flex column gap="xxs" class="device-meta">
                    <Skeleton width="160px" height="0.95rem" />
                    <Skeleton width="240px" height="0.85rem" />
                  </Flex>
                  <Flex gap="s" y-center :column="isBelowSmall" :row="!isBelowSmall" :expand="isBelowSmall">
                    <Skeleton width="82px" height="1.6rem" />
                    <Skeleton :width="isBelowSmall ? '100%' : '90px'" height="2.1rem" />
                  </Flex>
                </Flex>
              </Flex>
            </Flex>
          </div>
        </Flex>

        <template v-else>
          <Flex class="security-panel" gap="l" wrap expand>
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
            <Flex expand :column="isBelowSmall" gap="s" class="security-panel__actions">
              <Button
                variant="accent"
                :disabled="isTotpSetupActive"
                :class="isBelowSmall ? 'w-100' : 'w-50'"
                @click="startTotpEnrollment"
              >
                {{ hasVerifiedTotp ? 'Add Another Device' : 'Set Up Authenticator App' }}
              </Button>
              <Input
                v-model="totpSetup.friendlyName"
                expand
                name="mfa-device-name"
                :placeholder="nextTotpFriendlyName()"
                :disabled="totpSetup.enrolling || isTotpSetupActive"
                :class="isBelowSmall ? 'w-100' : 'w-50'"
              />
            </Flex>
          </Flex>

          <div v-if="mfaFactors.length" class="w-100">
            <Flex column gap="s" expand>
              <Flex x-between y-center wrap expand>
                <strong>Your devices</strong>
                <span class="text-xs text-color-lighter">{{ mfaFactors.length }} configured</span>
              </Flex>

              <Flex column gap="xs" class="device-list" expand>
                <Flex
                  v-for="(factor, index) in mfaFactors"
                  :key="factor.id"
                  expand
                  class="device-row"
                  x-between
                  y-center
                  wrap
                >
                  <Flex column gap="xxs" class="device-meta">
                    <strong class="text-s">{{ factorDisplayName(factor, index) }}</strong>
                    <span class="text-xs text-color-lighter">
                      {{ factorTypeLabel(factor.factor_type) }}
                      •
                      {{ factor.status === 'verified' ? 'Verified' : 'Pending verification' }}
                      <template v-if="factor.created_at">
                        • Added {{ formatFactorDate(factor.created_at) }}
                      </template>
                    </span>
                  </Flex>

                  <Flex gap="s" y-center :column="isBelowSmall" :row="!isBelowSmall" :expand="isBelowSmall">
                    <TinyBadge :variant="factor.status === 'verified' ? 'success' : 'warning'">
                      {{ factor.status === 'verified' ? 'Verified' : 'Pending' }}
                    </TinyBadge>
                    <Button
                      variant="danger"
                      outline
                      :expand="isBelowSmall"
                      :disabled="removeFactorLoading || totpSetup.enrolling || totpSetup.verifying"
                      @click="requestRemoveFactor(factor)"
                    >
                      Remove
                    </Button>
                  </Flex>
                </Flex>
              </Flex>
            </Flex>
          </div>

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
      <Alert v-if="removeFactorError" filled variant="danger">
        {{ removeFactorError }}
      </Alert>
    </Flex>
  </Card>

  <ConfirmModal
    v-model:open="removeFactorModalOpen"
    :confirm="removeSelectedFactor"
    :title="removeFactorTitle"
    :description="removeFactorDescription"
    confirm-text="Remove device"
    cancel-text="Cancel"
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

.device-list {
  width: 100%;
}

.device-row {
  width: 100%;
  padding: var(--space-s);
  border-radius: var(--border-radius-m);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
}

.device-meta {
  min-width: 220px;
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
