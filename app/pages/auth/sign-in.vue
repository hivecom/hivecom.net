<script setup lang="ts">
import type { Session } from '@supabase/supabase-js'
import { Alert, Button, Card, Flex, Input, OTP, OTPItem, Select, Tab, Tabs } from '@dolanske/vui'
import MetaballContainer from '@/components/Shared/MetaballContainer.vue'
import SupportModal from '@/components/Shared/SupportModal.vue'
import { useCacheMfaStatus } from '@/composables/useCacheMfaStatus'
import { useBreakpoint } from '@/lib/mediaQuery'
import { normalizeInternalRedirect } from '@/lib/utils/common'

import '@/assets/elements/auth.scss'

const route = useRoute()
const supabase = useSupabaseClient()
const loading = ref(false)
const discordLoading = ref(false)
const googleLoading = ref(false)
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const tab = ref('Password')
const supportModalOpen = ref(false)

const showEmailNotice = ref(false)
const mfaCode = ref('')
const mfaError = ref('')
const mfaVerifying = ref(false)
const restoringMfaChallenge = ref(false)
const showMfaReminder = ref(false)

interface MfaFactor {
  id: string
  factor_type: 'totp' | 'phone' | 'webauthn'
  status: 'verified' | 'unverified'
  created_at?: string
  friendly_name?: string | null
}

interface SelectOption {
  label: string
  value: string
}

const mfaDeviceOptions = ref<SelectOption[]>([])
const mfaDeviceSelection = ref<SelectOption[]>([])

const pendingMfa = reactive({
  factorId: '',
  factorLabel: '',
})
const mfaCache = useCacheMfaStatus()
const hasMfaSupport = computed(() => Boolean((supabase.auth as unknown as { mfa?: unknown }).mfa))
const requiresMfaChallenge = computed(() => Boolean(pendingMfa.factorId))
const mfaPromptCopy = 'Finish verification to sign-in.'
const isBelowS = useBreakpoint('<s')
const metaballHeight = computed(() => (isBelowS.value ? '100vh' : 'min(720px, 96vh)'))
const metaballWidth = computed(() => (isBelowS.value ? '100vw' : 'min(520px, 96vw)'))
const postSignInRedirect = computed(() => normalizeInternalRedirect(route.query.redirect))
const resolvedPostSignInRedirect = computed(() => postSignInRedirect.value ?? '/profile')

function normalizeOtpFromText(text: string) {
  const match = text.match(/\b(\d{6})\b/)
  if (match)
    return match[1]

  const digitsOnly = text.replace(/\D/g, '')
  if (digitsOnly.length === 6)
    return digitsOnly

  return null
}

function handleOtpPaste(event: ClipboardEvent) {
  if (!requiresMfaChallenge.value || mfaVerifying.value)
    return

  const clipboardText = event.clipboardData?.getData('text') ?? ''
  const code = normalizeOtpFromText(clipboardText)
  if (!code)
    return

  event.preventDefault()
  mfaCode.value = code
}

const otpWrapperRef = useTemplateRef('otp-wrapper')

function handleGlobalOtpPaste(event: ClipboardEvent) {
  if (!requiresMfaChallenge.value || mfaVerifying.value)
    return

  const wrapper = otpWrapperRef.value
  const target = event.target

  if (wrapper && target instanceof Node && !wrapper.contains(target))
    return

  handleOtpPaste(event)
}

watch(tab, (newTab: string) => {
  showEmailNotice.value = false
  if (newTab !== 'Password' && requiresMfaChallenge.value)
    void cancelMfaChallenge()
})

watchEffect(() => {
  if (route.query.banned === '1') {
    errorMessage.value = typeof route.query.message === 'string'
      ? route.query.message
      : 'Your account is currently suspended. Please contact support.'
  }
  else if (requiresMfaChallenge.value && showMfaReminder.value) {
    errorMessage.value = mfaPromptCopy
  }
  else if (errorMessage.value === mfaPromptCopy) {
    errorMessage.value = ''
  }
})

watch(
  () => route.query.mfa,
  (mfaFlag) => {
    if (mfaFlag === '1' && !requiresMfaChallenge.value)
      void restorePendingMfaChallenge()
  },
  { immediate: true },
)

async function signIn() {
  if (requiresMfaChallenge.value) {
    await verifyMfaCode()
    return
  }

  loading.value = true

  try {
    if (tab.value === 'Password') {
      await signInWithPassword()
    }
    else {
      await signInWithOtp()
    }
  }
  catch (error) {
    console.error('Sign-in error:', error)
  }
  finally {
    loading.value = false
  }
}

function getAuthRedirectUrl() {
  const redirect = postSignInRedirect.value

  if (process.env.NODE_ENV === 'development')
    return redirect ? `http://localhost:3000/auth/confirm?redirect=${encodeURIComponent(redirect)}` : 'http://localhost:3000/auth/confirm'

  if (typeof window !== 'undefined')
    return redirect ? `${window.location.origin}/auth/confirm?redirect=${encodeURIComponent(redirect)}` : `${window.location.origin}/auth/confirm`

  return redirect ? `/auth/confirm?redirect=${encodeURIComponent(redirect)}` : '/auth/confirm'
}

async function signInWithOtp() {
  // Make sure that the following URLs are whitelisted in your Supabase project settings
  // http://localhost:3000/auth/*
  // https://dev.hivecom.net/auth/*
  // https://hivecom.net/auth/*

  const redirectUrl = getAuthRedirectUrl()

  const { error } = await supabase.auth.signInWithOtp({
    email: email.value,
    options: {
      emailRedirectTo: redirectUrl,
    },
  })

  if (error) {
    errorMessage.value = error.message
  }
  else {
    showEmailNotice.value = true
  }
}

async function signInWithDiscord() {
  errorMessage.value = ''
  discordLoading.value = true

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: getAuthRedirectUrl(),
        scopes: 'identify',
      },
    })

    if (error)
      throw error
  }
  catch (error) {
    console.error('Discord sign-in error:', error)
    errorMessage.value = error instanceof Error ? error.message : 'Unable to sign in with Discord.'
  }
  finally {
    discordLoading.value = false
  }
}

async function signInWithGoogle() {
  errorMessage.value = ''
  googleLoading.value = true

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getAuthRedirectUrl(),
        scopes: 'email profile',
      },
    })

    if (error)
      throw error
  }
  catch (error) {
    console.error('Google sign-in error:', error)
    errorMessage.value = error instanceof Error ? error.message : 'Unable to sign in with Google.'
  }
  finally {
    googleLoading.value = false
  }
}

async function signInWithPassword() {
  resetMfaState()
  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  })

  if (error) {
    errorMessage.value = error.message
  }
  else {
    const needsMfa = await prepareMfaRequirement()
    if (!needsMfa)
      navigateTo(resolvedPostSignInRedirect.value)
  }
}

async function restorePendingMfaChallenge() {
  if (restoringMfaChallenge.value || requiresMfaChallenge.value || !hasMfaSupport.value)
    return

  restoringMfaChallenge.value = true

  try {
    await prepareMfaRequirement({ remindUser: true })
  }
  finally {
    restoringMfaChallenge.value = false
  }
}

async function ensureMfaQueryFlag() {
  if (route.query.mfa === '1')
    return

  const updatedQuery = { ...route.query, mfa: '1' }
  await navigateTo({ path: route.path, query: updatedQuery }, { replace: true })
}

function resetMfaState() {
  pendingMfa.factorId = ''
  pendingMfa.factorLabel = ''
  mfaCode.value = ''
  mfaError.value = ''
  showMfaReminder.value = false
  mfaDeviceOptions.value = []
  mfaDeviceSelection.value = []
}

interface PrepareMfaOptions {
  remindUser?: boolean
}

async function prepareMfaRequirement(options: PrepareMfaOptions = {}) {
  if (!hasMfaSupport.value)
    return false

  try {
    const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalError)
      throw aalError

    const needsAal2 = aalData?.nextLevel === 'aal2' && aalData?.currentLevel !== 'aal2'
    if (!needsAal2)
      return false

    const { data, error: factorsError } = await supabase.auth.mfa.listFactors()
    if (factorsError)
      throw factorsError

    const allFactors = (Array.isArray(data?.all) ? data.all : []) as MfaFactor[]
    const verifiedTotpFactors = allFactors.filter(factor => factor.factor_type === 'totp' && factor.status === 'verified')

    if (!verifiedTotpFactors.length)
      throw new Error('No verified authenticator is configured for this account.')

    const optionsList = verifiedTotpFactors.map((factor, index) => {
      const friendly = factor.friendly_name?.trim()
      return {
        label: friendly || `Authenticator app ${index + 1}`,
        value: factor.id,
      }
    })

    mfaDeviceOptions.value = optionsList

    const existingSelection = mfaDeviceSelection.value[0]
    const preferredOption = existingSelection
      ? optionsList.find(option => option.value === existingSelection.value)
      : undefined

    const selectedOption = preferredOption ?? optionsList[0]
    if (!selectedOption)
      throw new Error('No verified authenticator is configured for this account.')

    mfaDeviceSelection.value = [selectedOption]

    pendingMfa.factorId = selectedOption.value
    pendingMfa.factorLabel = selectedOption.label || email.value
    await ensureMfaQueryFlag()

    if (options.remindUser) {
      showMfaReminder.value = true
      errorMessage.value = mfaPromptCopy
    }
    else {
      showMfaReminder.value = false
      if (errorMessage.value === mfaPromptCopy)
        errorMessage.value = ''
    }

    return true
  }
  catch (error) {
    console.error('Unable to determine MFA status:', error)
    errorMessage.value = error instanceof Error ? error.message : 'Unable to complete multi-factor verification. Please try again.'
    await supabase.auth.signOut({ scope: 'local' })
    resetMfaState()
    return false
  }
}

watch(mfaDeviceSelection, (selection) => {
  if (!requiresMfaChallenge.value)
    return

  const next = selection[0]
  if (!next)
    return

  if (pendingMfa.factorId === next.value)
    return

  pendingMfa.factorId = next.value
  pendingMfa.factorLabel = next.label
  mfaCode.value = ''
  mfaError.value = ''
})

async function verifyMfaCode() {
  if (!requiresMfaChallenge.value)
    return

  const code = mfaCode.value.trim()
  if (!code) {
    mfaError.value = 'Enter the 6-digit code from your authenticator app.'
    return
  }

  mfaVerifying.value = true
  mfaError.value = ''

  try {
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: pendingMfa.factorId,
      code,
    })

    if (error)
      throw error

    const { data: sessionResult, error: sessionError } = await supabase.auth.getSession()
    if (sessionError)
      console.warn('Unable to fetch upgraded MFA session:', sessionError)

    await persistVerifiedMfaSession(sessionResult?.session ?? null)
    resetMfaState()
    navigateTo(resolvedPostSignInRedirect.value)
  }
  catch (error) {
    mfaError.value = error instanceof Error ? error.message : 'The provided code was invalid or expired.'
  }
  finally {
    mfaVerifying.value = false
  }
}

async function cancelMfaChallenge() {
  if (!requiresMfaChallenge.value)
    return

  await supabase.auth.signOut({ scope: 'local' })
  resetMfaState()

  if ('mfa' in route.query) {
    const updatedQuery = { ...route.query }
    delete updatedQuery.mfa
    navigateTo({ path: route.path, query: updatedQuery }, { replace: true })
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

// Clear errors when properties change
watch([email, password], () => {
  errorMessage.value = ''
  if (requiresMfaChallenge.value)
    void cancelMfaChallenge()
})

watch(mfaCode, (code) => {
  if (!requiresMfaChallenge.value)
    return
  const normalized = code.trim()
  if (normalized.length === 6 && !mfaVerifying.value)
    void verifyMfaCode()
})

// Auto-focus email input on page load
const emailInputRef = useTemplateRef('email-input')

onMounted(() => {
  // Ensure all sub-components are mounted
  nextTick(() => {
    if (emailInputRef.value) {
      emailInputRef.value.focus()
    }
  })

  if (typeof window !== 'undefined')
    window.addEventListener('paste', handleGlobalOtpPaste)
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined')
    window.removeEventListener('paste', handleGlobalOtpPaste)
})
</script>

<template>
  <Flex y-center x-center class="sign-in-page" column expand>
    <MetaballContainer :width="metaballWidth" :height="metaballHeight" min-height="520px">
      <Card class="login-card" separators>
        <template #header>
          <h4>Sign in</h4>
        </template>
        <div v-if="requiresMfaChallenge" class="container container-xs" style="min-height:356px">
          <Flex column gap="l" class="py-l" y-center expand>
            <Flex column gap="xs" y-center expand>
              <span class="text-s text-color-muted">Step 2 of 2</span>
              <h5 class="mfa-heading">
                Enter your authenticator code
              </h5>
              <span v-if="pendingMfa.factorLabel" class="text-xs text-color-lighter">
                Using: {{ pendingMfa.factorLabel }}
              </span>
            </Flex>
            <Flex v-if="mfaDeviceOptions.length > 1" column gap="xs" expand>
              <Select
                v-model="mfaDeviceSelection"
                :options="mfaDeviceOptions"
                placeholder="Select MFA device"
                :disabled="mfaVerifying"
                expand
              />
            </Flex>
            <Flex column gap="xs" expand x-center>
              <Flex y-center gap="s" column x-center expand>
                <span class="text-xs text-color-lighter">One-time code</span>
                <div ref="otp-wrapper">
                  <OTP
                    v-model="mfaCode"
                    mode="num"
                    :disabled="mfaVerifying"
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
                </div>
              </Flex>
            </Flex>
            <Flex column gap="s" expand>
              <Button expand variant="fill" :loading="mfaVerifying" @click="verifyMfaCode">
                Verify code
              </Button>
              <Button expand variant="gray" :disabled="mfaVerifying" @click="cancelMfaChallenge">
                Cancel sign-in
              </Button>
            </Flex>
            <Alert v-if="mfaError" filled variant="danger">
              {{ mfaError }}
            </Alert>
            <Alert v-else-if="errorMessage && route.query.mfa === '1'" filled variant="danger">
              {{ errorMessage }}
            </Alert>
            <Flex column y-center expand>
              <Button variant="link" @click="supportModalOpen = true">
                <p class="text-color-lighter text-s">
                  Having trouble signing in?
                </p>
              </Button>
            </Flex>
          </Flex>
        </div>
        <div v-else class="container container-xs" style="min-height:356px">
          <Flex x-center y-center column gap="l" class="py-l">
            <Flex x-center y-center column gap="s" expand>
              <Button variant="gray" :loading="discordLoading" expand @click="signInWithDiscord">
                <Flex y-center gap="s">
                  <Icon name="ph:discord-logo" />
                  Continue with Discord
                </Flex>
              </Button>
              <Button variant="gray" :loading="googleLoading" expand @click="signInWithGoogle">
                <Flex y-center gap="s">
                  <Icon name="ph:google-logo" />
                  Continue with Google
                </Flex>
              </Button>
            </Flex>
            <Tabs v-model="tab" variant="filled" expand>
              <Tab value="Password" />
              <Tab value="E-mail" />
            </Tabs>
            <Input ref="email-input" v-model="email" expand placeholder="user@example.com" label="Email" type="email" />
            <Input v-if="tab === 'Password'" v-model="password" expand placeholder="●●●●●●●●●●●●●" label="Password" type="password" />
            <Button
              variant="fill"
              :loading="loading"
              :disabled="tab === 'Password' ? !(email && password) : !email"
              expand
              @click="signIn"
            >
              Sign in
            </Button>
            <Alert v-if="showEmailNotice" filled variant="info">
              <p class="text-s">
                An email with a sign-in link has been sent to your inbox! Please check your spam folder as well! <a href="https://mail.google.com" rel="noopener noreferrer">Open Gmail</a>
              </p>
            </Alert>
            <Alert v-if="errorMessage" variant="danger" filled>
              <p class="text-s">
                {{ errorMessage }}
              </p>
            </Alert>
            <Button v-if="tab === 'Password'" variant="link">
              <NuxtLink to="/auth/forgot-password" class="text-color-lighter" aria-label="Reset your password">
                Forgot your password?
              </NuxtLink>
            </Button>
            <Button v-else variant="link" @click="supportModalOpen = true">
              <p class="text-color-lighter text-s">
                Having trouble signing in?
              </p>
            </Button>
          </Flex>
        </div>
        <template v-if="!requiresMfaChallenge" #footer>
          <NuxtLink to="/auth/sign-up" class="auth-link text-color-accent" aria-label="Sign up for a new account">
            Don't have an account? Click to sign-up!
          </NuxtLink>
        </template>
      </Card>
    </MetaballContainer>
    <SupportModal v-model:open="supportModalOpen" />
    <div class="animated-blob first" />
    <div class="animated-blob second" />
  </Flex>
</template>

<style lang="scss" scoped>
.auth-link {
  display: block;
  width: 100%;
  font-size: var(--font-size-m);
  padding: var(--space-s) var(--space-m);
  text-decoration: none;
  border-radius: var(--border-radius-s);
  transition: background-color 0.2s ease;
  text-align: center;

  &:hover {
    background-color: var(--color-bg-raised);
  }
}

.mfa-heading {
  font-size: var(--font-size-l);
  margin: 0;
}

.otp-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 var(--space-m);
  color: var(--color-text-light);
}
</style>
