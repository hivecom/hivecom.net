<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import type { TeamSpeakIdentityRecord } from '@/types/teamspeak'
import { Alert, Badge, Button, Flex, Input, Kbd, KbdGroup, Modal, pushToast, Select } from '@dolanske/vui'
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
const isMac = computed(() => import.meta.client && /Mac|iP(?:hone|od|ad)/i.test(navigator.userAgent))
const identityShortcut = computed(() => isMac.value ? ['⌘', 'I'] : ['Ctrl', 'I'])

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
const buttonLabel = computed(() => hasLinkedIdentities.value ? 'Manage TeamSpeak' : 'Connect TeamSpeak')
const stepBadge = computed(() => {
  switch (step.value) {
    case 'manage':
      return 'Manage'
    case 'request':
      return 'Step 1 / 3'
    case 'confirm':
      return 'Step 2 / 3'
    default:
      return 'Step 3 / 3'
  }
})

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
</script>

<template>
  <div class="teamspeak-connect">
    <Button
      variant="fill"
      class="teamspeak-manage"
      :disabled="!hasServers"
      @click="openModal"
    >
      <template #start>
        <Icon name="mdi:teamspeak" />
      </template>
      {{ buttonLabel }}
    </Button>

    <Modal :open="isOpen" centered :card="{ separators: true }" :size="isBelowSmall ? 'screen' : undefined" @close="handleClose">
      <template #header>
        <Flex x-between y-center>
          <div>
            <h3>Link TeamSpeak Identity</h3>
            <p class="text-xs text-color-lighter">
              Securely connect your TeamSpeak identity to manage access.
            </p>
          </div>
          <Badge variant="neutral">
            {{ stepBadge }}
          </Badge>
        </Flex>
      </template>

      <Flex column gap="l">
        <section v-if="step === 'manage'" class="link-step">
          <h4>Manage linked identities</h4>
          <p class="text-s text-color-lighter mb-s">
            View or remove your linked TeamSpeak identities. Add another to link more clients.
          </p>

          <Flex expand column class="identity-list">
            <Flex expand x-between y-center class="identity-list__header">
              <h4>Linked Identities</h4>
              <Badge variant="neutral">
                {{ identities.length }}
              </Badge>
            </Flex>

            <Flex v-if="identities.length === 0" expand class="identity-list__empty">
              <p>You have not linked any TeamSpeak identities yet.</p>
            </Flex>
            <ul v-else>
              <li v-for="identity in identities" :key="`${identity.serverId}-${identity.uniqueId}`">
                <Flex column gap="xs" expand>
                  <Flex gap="s" y-center expand>
                    <Badge variant="info">
                      {{ identity.serverId.toUpperCase() }}
                    </Badge>
                    <code class="identity-code">{{ identity.uniqueId }}</code>
                    <Button
                      size="s"
                      variant="danger"
                      :loading="unlinking[identityKey(identity)]"
                      :disabled="unlinking[identityKey(identity)]"
                      @click="handleUnlink(identity)"
                    >
                      Unlink
                    </Button>
                  </Flex>
                  <span class="text-xs text-color-lighter">
                    Linked {{ identity.linkedAt ? new Date(identity.linkedAt).toLocaleString() : 'time unknown' }}
                  </span>
                </Flex>
              </li>
            </ul>
          </Flex>
        </section>

        <section v-else-if="step === 'request'" class="link-step">
          <h4>Step 1 - Send Verification Message</h4>
          <p class="text-s text-color-lighter mb-s">
            Enter the TeamSpeak unique ID you want to link. We will send a secure token to your client on the selected server.
          </p>

          <Alert variant="neutral" filled class="mb-m">
            <p class="text-xs">
              In TeamSpeak: open <strong class="text-xs">Tools → Identities</strong>, enable <strong class="text-xs">Advanced Mode</strong>, pick your current identity, then copy the <strong class="text-xs">Unique ID</strong> value.
            </p>
            <Flex x-start y-center gap="xs" class="identity-shortcut">
              <span class="text-xs text-color-lighter">Shortcut:</span>
              <KbdGroup>
                <Kbd v-for="key in identityShortcut" :key="key" :keys="key" highlight />
              </KbdGroup>
              <span class="text-xs text-color-lighter">opens Identities in TeamSpeak.</span>
            </Flex>
          </Alert>

          <Flex column gap="m" expand>
            <Input
              v-model="form.uniqueId"
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

            <p v-if="selectedServer" class="text-xs text-color-lighter">
              Connecting via {{ selectedServer.queryHost ?? 'n/a' }} on port
              {{ selectedServer.queryPort ?? 10011 }} targeting voice port
              {{ selectedServer.voicePort ?? 'default' }}.
            </p>
          </Flex>
        </section>

        <section v-else-if="step === 'confirm'" class="link-step">
          <h4>Step 2 — Confirm Token</h4>
          <p class="text-s text-color-lighter mb-m">
            Enter the token you just received in TeamSpeak. Tokens expire quickly, so complete this step soon.
          </p>

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
          <h4>All set!</h4>
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
          <Button
            variant="gray"
            :expand="isBelowSmall"
            :disabled="requestLoading || confirmLoading"
            @click="handleClose"
          >
            Close
          </Button>

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

          <Button
            v-else-if="step === 'request'"
            variant="accent"
            :expand="isBelowSmall"
            :loading="requestLoading"
            :disabled="!hasServers"
            @click="handleRequest"
          >
            Send Verification
          </Button>

          <template v-else-if="step === 'confirm'">
            <Button variant="gray" :expand="isBelowSmall" :disabled="confirmLoading" @click="resetFlow('request')">
              Start Over
            </Button>
            <Button variant="accent" :expand="isBelowSmall" :loading="confirmLoading" @click="handleConfirm">
              Confirm Token
            </Button>
          </template>

          <template v-else>
            <Button
              variant="accent"
              :expand="isBelowSmall"
              @click="hasLinkedIdentities ? resetFlow('manage') : resetFlow('request')"
            >
              {{ hasLinkedIdentities ? 'Back to Manage' : 'Link Another Identity' }}
            </Button>
          </template>
        </Flex>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.teamspeak-connect {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.link-step {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.identity-list {
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-m);
}

.identity-list__header {
  margin-bottom: var(--space-s);
}

.identity-list__empty {
  padding: var(--space-m);
  border: 1px dashed var(--color-border);
  border-radius: var(--border-radius-m);
  text-align: center;
  color: var(--color-text-muted, #a0a0a0);
}

.identity-list ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

.identity-code {
  font-size: 0.85rem;
  background: var(--color-bg-subtle);
  padding: 0.15rem 0.5rem;
  border-radius: var(--border-radius-s);
  word-break: break-all;
}

.identity-shortcut {
  margin-top: var(--space-xs);
}
</style>
