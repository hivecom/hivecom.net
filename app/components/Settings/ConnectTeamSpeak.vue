<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import type { TeamSpeakIdentityRecord } from '@/types/teamspeak'
import { Alert, Button, Flex, Input, Modal, pushToast, Select } from '@dolanske/vui'
import { computed, reactive, ref, watch } from 'vue'
import constants from '~~/constants.json'
import { useBreakpoint } from '@/lib/mediaQuery'
import { identityKey, normalizeTeamSpeakIdentities } from '@/lib/teamspeak'

interface SelectOption {
  label: string
  value: string
  description?: string
}

interface VerifyRequestResponse {
  serverId: string
  uniqueId: string
  tokenExpiresAt?: string
}

interface VerifyConfirmResponse {
  status: string
  serverId: string
  uniqueId: string
  identities: TeamSpeakIdentityRecord[]
  groupsAssigned: number[]
  assignmentSkippedReason?: string
}

interface UnlinkResponse {
  status: string
  removedCount: number
  removed: TeamSpeakIdentityRecord[]
  identities: TeamSpeakIdentityRecord[]
}

const props = defineProps<{ profile: Tables<'profiles'> | null }>()
const emit = defineEmits<{ (e: 'linked'): void }>()
const isOpen = ref(false)
const isBelowSmall = useBreakpoint('<xs')
const isBelowMedium = useBreakpoint('<m')

const supabase = useSupabaseClient()

const teamspeakServers = computed(() => constants.PLATFORMS?.TEAMSPEAK?.servers ?? [])
const serverOptions = computed<SelectOption[]>(() => teamspeakServers.value.map(server => ({
  label: server.title ?? server.id.toUpperCase(),
  value: server.id,
  description: [server.queryHost, server.voicePort ?? server.queryPort].filter(Boolean).join(':') || undefined,
})))

const form = reactive({
  uniqueId: '',
  serverId: teamspeakServers.value[0]?.id ?? '',
})

const tokenForm = reactive({ token: '' })

const fieldErrors = reactive({
  uniqueId: '',
  token: '',
})

const formError = ref('')
const requestLoading = ref(false)
const confirmLoading = ref(false)
const step = ref<'manage' | 'request' | 'confirm' | 'success'>('request')
const requestResult = ref<{ serverId: string, uniqueId: string, tokenExpiresAt?: string } | null>(null)
const confirmationResult = ref<{ groupsAssigned: number[], assignmentSkippedReason?: string } | null>(null)
const localIdentities = ref<TeamSpeakIdentityRecord[]>([])
const unlinking = reactive<Record<string, boolean>>({})

watch(() => props.profile?.teamspeak_identities, (identities) => {
  localIdentities.value = normalizeTeamSpeakIdentities(identities)
}, { immediate: true })

watch(teamspeakServers, (servers) => {
  if (!form.serverId && servers[0]) {
    form.serverId = servers[0].id
  }
}, { immediate: true })

watch(isOpen, (open) => {
  if (!open) {
    resetFlow('request')
  }
})

const hasServers = computed(() => serverOptions.value.length > 0)
const selectedServer = computed(() => teamspeakServers.value.find(server => server.id === form.serverId) ?? null)

const serverSelectModel = computed<SelectOption[] | undefined>({
  get() {
    const selection = serverOptions.value.find(option => option.value === form.serverId)
    return selection ? [selection] : undefined
  },
  set(value) {
    const next = value?.[0]?.value ?? teamspeakServers.value[0]?.id ?? ''
    form.serverId = next
  },
})

const identities = computed(() => localIdentities.value)
const hasLinkedIdentities = computed(() => identities.value.length > 0)
const buttonLabel = computed(() => hasLinkedIdentities.value ? 'Manage' : 'Connect')
const isProfileLoading = computed(() => props.profile === null)

function openModal() {
  isOpen.value = true
  step.value = hasLinkedIdentities.value ? 'manage' : 'request'
}

function handleClose() {
  isOpen.value = false
}

watch(localIdentities, (list) => {
  if (list.length === 0 && step.value === 'manage') {
    step.value = 'request'
  }
})

function resetFlow(targetStep: 'manage' | 'request' | 'confirm' | 'success' = 'request') {
  form.uniqueId = ''
  tokenForm.token = ''
  fieldErrors.uniqueId = ''
  fieldErrors.token = ''
  formError.value = ''
  requestResult.value = null
  confirmationResult.value = null
  step.value = targetStep
  if (teamspeakServers.value[0])
    form.serverId = teamspeakServers.value[0].id
}

function validateRequestForm() {
  fieldErrors.uniqueId = ''
  formError.value = ''
  if (!form.uniqueId.trim()) {
    fieldErrors.uniqueId = 'A TeamSpeak unique ID is required.'
    return false
  }
  if (form.uniqueId.trim().length < 5) {
    fieldErrors.uniqueId = 'Unique IDs must be at least 5 characters.'
    return false
  }
  if (!form.serverId) {
    formError.value = 'Please choose a destination server.'
    return false
  }
  if (!hasServers.value) {
    formError.value = 'No TeamSpeak servers are configured. Contact an administrator.'
    return false
  }
  return true
}

function validateTokenForm() {
  fieldErrors.token = ''
  formError.value = ''
  if (!tokenForm.token.trim()) {
    fieldErrors.token = 'Enter the verification token from TeamSpeak.'
    return false
  }
  if (tokenForm.token.trim().length < 6) {
    fieldErrors.token = 'Tokens should be at least 6 characters.'
    return false
  }
  return true
}

async function handleRequest() {
  if (!validateRequestForm())
    return

  const uniqueId = form.uniqueId.trim()
  const alreadyLinked = identities.value.some(identity =>
    identity.serverId === form.serverId && identity.uniqueId === uniqueId,
  )
  if (alreadyLinked) {
    formError.value = 'This TeamSpeak identity is already linked to your account.'
    return
  }

  requestLoading.value = true
  formError.value = ''
  try {
    const { data, error } = await supabase.functions.invoke<VerifyRequestResponse>('teamspeak-verify-request', {
      body: {
        uniqueId,
        serverId: form.serverId,
      },
    })

    if (error)
      throw error

    if (!data)
      throw new Error('No response from verification function.')

    requestResult.value = {
      serverId: data.serverId,
      uniqueId: data.uniqueId,
      tokenExpiresAt: data.tokenExpiresAt,
    }
    step.value = 'confirm'
    pushToast('Verification token sent to TeamSpeak.')
  }
  catch (error) {
    formError.value = extractFunctionsErrorMessage(error)
      ?? (error instanceof Error ? error.message : 'Unable to start TeamSpeak verification.')
  }
  finally {
    requestLoading.value = false
  }
}

async function handleConfirm() {
  if (!requestResult.value) {
    formError.value = 'Send a verification request before confirming the token.'
    return
  }

  if (!validateTokenForm())
    return

  confirmLoading.value = true
  formError.value = ''
  try {
    const { data, error } = await supabase.functions.invoke<VerifyConfirmResponse>('teamspeak-verify-confirm', {
      body: {
        uniqueId: form.uniqueId.trim(),
        serverId: form.serverId,
        token: tokenForm.token.trim(),
      },
    })

    if (error)
      throw error

    if (!data)
      throw new Error('No response from confirmation function.')

    tokenForm.token = ''
    confirmationResult.value = {
      groupsAssigned: data.groupsAssigned ?? [],
      assignmentSkippedReason: data.assignmentSkippedReason,
    }
    localIdentities.value = normalizeTeamSpeakIdentities(data.identities ?? localIdentities.value)
    step.value = 'success'
    pushToast('TeamSpeak identity linked successfully.')
    emit('linked')
  }
  catch (error) {
    formError.value = error instanceof Error ? error.message : 'Unable to confirm verification token.'
  }
  finally {
    confirmLoading.value = false
  }
}

async function handleUnlink(identity: TeamSpeakIdentityRecord) {
  const key = identityKey(identity)
  if (unlinking[key])
    return
  unlinking[key] = true
  formError.value = ''

  try {
    const { data, error } = await supabase.functions.invoke<UnlinkResponse>('teamspeak-unlink', {
      body: {
        uniqueId: identity.uniqueId,
        serverId: identity.serverId,
      },
    })

    if (error)
      throw error

    if (!data)
      throw new Error('No response from unlink function.')

    localIdentities.value = normalizeTeamSpeakIdentities(data.identities ?? [])
    pushToast('TeamSpeak identity unlinked.')
    emit('linked')
    if (localIdentities.value.length === 0)
      resetFlow('request')
  }
  catch (error) {
    formError.value = error instanceof Error ? error.message : 'Unable to unlink TeamSpeak identity.'
  }
  finally {
    unlinking[key] = false
  }
}

async function handleUnlinkAll() {
  if (!hasLinkedIdentities.value)
    return
  if (unlinking.__all__)
    return

  unlinking.__all__ = true
  formError.value = ''

  try {
    const { data, error } = await supabase.functions.invoke<UnlinkResponse>('teamspeak-unlink', {
      body: {},
    })

    if (error)
      throw error

    if (!data)
      throw new Error('No response from unlink function.')

    localIdentities.value = normalizeTeamSpeakIdentities(data.identities ?? [])
    pushToast('All TeamSpeak identities unlinked.')
    emit('linked')
    resetFlow('request')
  }
  catch (error) {
    formError.value = error instanceof Error ? error.message : 'Unable to unlink TeamSpeak identities.'
  }
  finally {
    unlinking.__all__ = false
  }
}

const successMessage = computed(() => {
  if (!confirmationResult.value)
    return 'TeamSpeak identity linked successfully.'

  if (confirmationResult.value.assignmentSkippedReason === 'banned')
    return 'Identity saved, but no TeamSpeak groups were assigned because your account is banned.'

  if (confirmationResult.value.groupsAssigned.length === 0)
    return 'Identity saved. TeamSpeak groups were not assigned because none are configured for this server.'

  const count = confirmationResult.value.groupsAssigned.length
  return `Identity saved and ${count} server group${count === 1 ? '' : 's'} assigned.`
})

function extractFunctionsErrorMessage(error: unknown): string | null {
  const ctx = (error as { context?: Record<string, unknown> })?.context ?? {}
  const status = (ctx as { status?: number }).status
    ?? (error as { status?: number }).status
    ?? (ctx as { response?: { status?: number } }).response?.status
    ?? (error as { response?: { status?: number } }).response?.status

  const rawBody = (error as { body?: unknown }).body
    ?? (ctx as { body?: unknown }).body
    ?? (ctx as { response?: { body?: unknown } }).response?.body
    ?? (ctx as { response?: { error?: unknown } }).response?.error
    ?? (error as { response?: { error?: unknown } }).response?.error
    ?? (error as { error?: unknown }).error
    ?? (error as { context?: { response?: { error?: unknown } } }).context?.response?.error

  const parsedBody = typeof rawBody === 'string'
    ? safeParseJson(rawBody)
    : rawBody

  const message = typeof (parsedBody as { error?: unknown })?.error === 'string'
    ? (parsedBody as { error: string }).error
    : typeof (parsedBody as { message?: unknown })?.message === 'string'
      ? (parsedBody as { message: string }).message
      : typeof (parsedBody as { msg?: unknown })?.msg === 'string'
        ? (parsedBody as { msg: string }).msg
        : null

  if (message && status)
    return `${message}${status >= 400 ? ` (HTTP ${status})` : ''}`

  if (message)
    return message

  if (status === 404)
    return 'No TeamSpeak client found for that unique ID on this server.'

  return (error as { message?: string })?.message ?? null
}

function safeParseJson(input: string): unknown {
  try {
    return JSON.parse(input)
  }
  catch {
    return null
  }
}

const modalLabel = computed(() => {
  if (step.value === 'request') {
    return 'Enter the TeamSpeak unique ID you want to link. We will send a secure token to your client on the selected server.'
  }
  else if (step.value === 'confirm') {
    return 'Enter the token you just received in TeamSpeak. Tokens expire quickly, so complete this step soon.'
  }
  else if (step.value === 'manage') {
    return 'Manage your connected TeamSpeak identities.'
  }

  return ''
})

const modalTitle = computed(() => {
  if (step.value === 'request') {
    return 'Step 1 - Send Verification Message'
  }
  else if (step.value === 'confirm') {
    return 'Step 2 — Confirm Token'
  }
  else if (step.value === 'manage') {
    return 'TeamSpeak integration'
  }

  return 'Connection successul!'
})
</script>

<template>
  <div class="teamspeak-connect">
    <Button
      variant="fill"
      class="teamspeak-manage"
      :expand="isBelowMedium"
      :loading="isProfileLoading"
      :disabled="isProfileLoading || !hasServers"
      size="s"
      @click="openModal"
    >
      {{ buttonLabel }}
    </Button>

    <Modal :open="isOpen" centered :card="{ separators: true }" :size="isBelowSmall ? 'screen' : undefined" @close="handleClose">
      <template #header>
        <Flex column gap="xxs">
          <h4>{{ modalTitle }}</h4>
          <p v-if="modalLabel" class="teamspeak-connect__subtitle">
            {{ modalLabel }}
          </p>
        </Flex>
      </template>

      <Flex column gap="l" expand>
        <section v-if="step === 'manage'" class="link-step">
          <Flex expand column class="identity-list">
            <strong class="identity-list__header">
              Linked Identities
            </strong>

            <Flex v-if="identities.length === 0" expand class="identity-list__empty">
              <p>You have not linked any TeamSpeak identities yet.</p>
            </Flex>
            <ul v-else class="w-100">
              <li v-for="identity in identities" :key="`${identity.serverId}-${identity.uniqueId}`" class="identity-list__item">
                <Flex column gap="xxs" expand>
                  <Flex gap="s" y-center expand>
                    <p class="w-100">
                      {{ identity.uniqueId }}
                    </p>
                    <Button
                      size="s"
                      variant="danger"
                      :loading="unlinking[identityKey(identity)]"
                      :disabled="unlinking[identityKey(identity)]"
                      @click="handleUnlink(identity)"
                    >
                      <template #start>
                        <Icon name="ph:trash" />
                      </template>
                      Unlink
                    </Button>
                  </Flex>
                  <Flex gap="xs" y-center>
                    <span class="text-xs text-color-lighter">{{ identity.serverId.toUpperCase() }}</span>
                    <span class="text-xs text-color-lighter">•</span>
                    <span class="text-xs text-color-lighter">Linked {{ identity.linkedAt ? new Date(identity.linkedAt).toLocaleString() : 'time unknown' }}</span>
                  </Flex>
                </Flex>
              </li>
            </ul>
          </Flex>
        </section>

        <section v-else-if="step === 'request'" class="link-step">
          <Flex column gap="l" expand>
            <Input
              v-model="form.uniqueId"
              hint="Open Tools > Identities > Go Advanced. Pick your current identity and copy the Unique ID value. "
              expand
              label="TeamSpeak Unique ID"
              placeholder="e.g. Nc4M5c9yWlWdrtG19Kk7H7y0X0w="
              :error="fieldErrors.uniqueId || undefined"
              :disabled="requestLoading || !hasServers"
              required
            />

            <Select
              v-model="serverSelectModel"
              label="Destination Server"
              placeholder="Select a TeamSpeak server"
              :options="serverOptions"
              :disabled="requestLoading || !hasServers"
              single
              search
              expand
            />
          </Flex>
          <p v-if="selectedServer" class="text-s text-color-lightest mt-xxs">
            Connecting via {{ selectedServer.queryHost ?? 'n/a' }} on port
            {{ selectedServer.queryPort ?? 10011 }} targeting voice port
            {{ selectedServer.voicePort ?? 'default' }}.
          </p>
        </section>

        <section v-else-if="step === 'confirm'" class="link-step">
          <Input
            v-model="tokenForm.token"
            expand
            label="Verification Token"
            placeholder="Enter the token from TeamSpeak"
            :error="fieldErrors.token || undefined"
            :disabled="confirmLoading"
            required
          />
        </section>

        <Flex v-else expand column class="link-step">
          <Alert variant="success" filled>
            {{ successMessage }}
          </Alert>
        </Flex>

        <Alert v-if="!hasServers" variant="danger" filled>
          No TeamSpeak servers are configured. Please contact an administrator.
        </Alert>

        <Alert v-if="formError" variant="danger" filled>
          {{ formError }}
        </Alert>
      </Flex>

      <template #footer>
        <Flex gap="s" x-end wrap expand>
          <template v-if="step === 'manage'">
            <Button
              v-if="hasLinkedIdentities"
              variant="danger"
              :expand="isBelowSmall"
              :loading="unlinking.__all__"
              :disabled="unlinking.__all__"
              @click="handleUnlinkAll"
            >
              Unlink All
            </Button>
            <Button variant="accent" :expand="isBelowSmall" :disabled="!hasServers" @click="resetFlow('request')">
              Add Identity
            </Button>
          </template>

          <template v-else-if="step === 'request'">
            <Button variant="gray" :expand="isBelowSmall" :disabled="confirmLoading" @click="resetFlow('manage')">
              Back
            </Button>
            <Button
              variant="accent"
              :expand="isBelowSmall"
              :loading="requestLoading"
              :disabled="!hasServers"
              @click="handleRequest"
            >
              Send Verification
            </Button>
          </template>

          <template v-else-if="step === 'confirm'">
            <Button variant="gray" plain :expand="isBelowSmall" :disabled="confirmLoading" @click="resetFlow('request')">
              Back
            </Button>
            <Button variant="accent" :expand="isBelowSmall" :loading="confirmLoading" @click="handleConfirm">
              Confirm Token
            </Button>
          </template>

          <template v-else>
            <Button
              variant="accent"
              :expand="isBelowSmall"
              @click="handleClose"
            >
              Finish
            </Button>
          </template>
        </Flex>
      </template>
    </Modal>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/breakpoints.scss' as *;

.teamspeak-connect {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  width: 100%;

  &__subtitle {
    font-size: var(--font-size-m);
    color: var(--color-text-light);
    padding-right: var(--space-xl);
  }
}

.link-step {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
}

.identity-list {
  &__header {
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-m);
    color: var(--color-text-light);
  }

  &__empty {
    padding: var(--space-m);
    border: 1px dashed var(--color-border);
    border-radius: var(--border-radius-m);
    text-align: center;
    color: var(--color-text-muted, #a0a0a0);
  }

  &__item {
    padding: var(--space-xs) var(--space-s);
    background-color: var(--color-bg-lowered);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-s);

    p {
      white-space: wrap;
      word-break: break-all;
    }
  }
}

@media (max-width: $breakpoint-s) {
  .teamspeak-connect__subtitle {
    padding-right: var(--space-m);
  }
}
</style>
