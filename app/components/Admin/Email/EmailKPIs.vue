<script setup lang="ts">
import type { EmailOverview } from '@/composables/useEmailAdmin'
import { Alert } from '@dolanske/vui'
import { computed, onBeforeMount, ref, watch } from 'vue'
import KPICard from '@/components/Admin/KPICard.vue'
import KPIContainer from '@/components/Admin/KPIContainer.vue'
import { useEmailAdmin } from '@/composables/useEmailAdmin'

const { fetchOverview } = useEmailAdmin()

// Bumped by the page after a broadcast goes out, so the quota card reflects
// the send without a manual reload. The overview model shares the fetched
// state upward, the compose form shows the recipient count from it.
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })
const overviewModel = defineModel<EmailOverview | null>('overview', { default: null })

const loading = ref(true)
const errorMessage = ref('')
const overview = ref<EmailOverview | null>(null)

async function fetchStatus() {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchOverview()
    overviewModel.value = overview.value
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load email status'
  }
  finally {
    loading.value = false
  }
}

onBeforeMount(fetchStatus)

watch(refreshSignal, () => {
  fetchStatus()
})

const account = computed(() => overview.value?.account ?? null)
const identity = computed(() => overview.value?.identity ?? null)

function formatCount(value: number | null): string {
  return value === null ? 'Unknown' : value.toLocaleString()
}

const sendingEnabled = computed(() => account.value?.sendingEnabled === true)

// SES reports HEALTHY while the account is in good standing. Anything else, or
// a sandboxed account, means sends are throttled or dropped.
const enforcementHealthy = computed(() => account.value?.enforcementStatus === 'HEALTHY')
const productionAccess = computed(() => account.value?.productionAccess === true)

const enforcementValue = computed(() => account.value?.enforcementStatus ?? 'Unknown')

// Every judgement variant stays gray until data lands - a red icon during
// loading reads as an outage that isn't there.
const sendingVariant = computed(() => {
  if (!account.value)
    return 'gray'
  return sendingEnabled.value ? 'success' : 'danger'
})

const enforcementVariant = computed(() => {
  if (!account.value)
    return 'gray'
  return enforcementHealthy.value && productionAccess.value ? 'success' : 'danger'
})
const enforcementDescription = computed(() => {
  if (!productionAccess.value)
    return 'The account has no production access, so SES only delivers to verified addresses.'
  return 'SES account standing. HEALTHY means bounce and complaint rates are inside the review thresholds.'
})

// The rolling 24 hour window, shown as sent over cap. Both halves can be null
// when SES leaves the quota out of the response.
const quotaValue = computed(() => {
  const quota = account.value?.quota
  if (!quota)
    return 'Unknown'
  return `${formatCount(quota.sentLast24Hours)} / ${formatCount(quota.max24HourSend)}`
})

const quotaUsage = computed(() => {
  const quota = account.value?.quota
  if (!quota || quota.sentLast24Hours === null || !quota.max24HourSend)
    return null
  return quota.sentLast24Hours / quota.max24HourSend
})

const quotaVariant = computed(() => {
  const usage = quotaUsage.value
  if (usage === null)
    return 'gray'
  if (usage >= 0.9)
    return 'danger'
  if (usage >= 0.75)
    return 'warning'
  return 'primary'
})

const quotaDescription = computed(() => {
  const usage = quotaUsage.value
  if (usage === null)
    return 'Messages sent in the rolling 24 hour window against the account cap.'
  return `${Math.round(usage * 100)}% of the rolling 24 hour cap used.`
})

const sendRateValue = computed(() => {
  const rate = account.value?.quota.maxSendRate
  return rate === null || rate === undefined ? 'Unknown' : `${rate}/s`
})

// A verified identity with published DKIM is the only fully green state. No
// identity at all is a warning, not an error: the domain may not be set up yet.
const identityValue = computed(() => identity.value?.domain ?? 'Not found')
const dkimVerified = computed(() => identity.value?.dkimStatus === 'SUCCESS')

const identityVariant = computed(() => {
  if (!overview.value)
    return 'gray'
  if (!identity.value)
    return 'warning'
  if (identity.value.verifiedForSending && dkimVerified.value)
    return 'success'
  return 'warning'
})

const identityDescription = computed(() => {
  if (!identity.value)
    return 'No SES identity exists for the sending domain, so nothing will deliver.'
  const verified = identity.value.verifiedForSending ? 'Verified for sending' : 'Not verified for sending'
  return `${verified}. DKIM ${identity.value.dkimStatus ?? 'unknown'}.`
})
</script>

<template>
  <KPIContainer class="email-kpi-row">
    <KPICard
      label="Sending"
      :value="sendingEnabled ? 'Enabled' : 'Paused'"
      icon="ph:paper-plane-tilt"
      :variant="sendingVariant"
      :is-loading="loading"
      description="Whether SES is currently accepting sends for this account."
    />

    <KPICard
      label="Enforcement"
      :value="enforcementValue"
      icon="ph:shield-check"
      :variant="enforcementVariant"
      :is-loading="loading"
      :description="enforcementDescription"
    />

    <KPICard
      label="24h Quota"
      :value="quotaValue"
      icon="ph:gauge"
      :variant="quotaVariant"
      :is-loading="loading"
      :description="quotaDescription"
    />

    <KPICard
      label="Send Rate"
      :value="sendRateValue"
      icon="ph:speedometer"
      variant="info"
      :is-loading="loading"
      description="Maximum messages per second SES accepts from this account."
    />

    <KPICard
      label="Identity"
      :value="identityValue"
      icon="ph:seal-check"
      :variant="identityVariant"
      :is-loading="loading"
      :description="identityDescription"
    />
  </KPIContainer>

  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>
</template>

<style scoped lang="scss">
.email-kpi-row {
  display: grid !important;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-m);
  align-items: stretch;
}

.email-kpi-row :deep(> .kpi-card) {
  width: 100%;
  height: 100%;
}
</style>
