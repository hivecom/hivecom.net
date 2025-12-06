<script setup lang="ts">
import type { Tables, TeamSpeakIdentityRecord } from '@/types/database.types'
import { Alert, Badge, Button, Flex, Input, Modal, pushToast, Select } from '@dolanske/vui'
import { computed, reactive, ref, watch } from 'vue'
import constants from '~~/constants.json'

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

const props = defineProps<{ profile: Tables<'profiles'> | null }>()
const emit = defineEmits<{ (e: 'close'): void, (e: 'linked'): void }>()
const isOpen = defineModel<boolean>('open', { default: false })

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
const step = ref<'request' | 'confirm' | 'success'>('request')
const requestResult = ref<{ serverId: string, uniqueId: string, tokenExpiresAt?: string } | null>(null)
const confirmationResult = ref<{ groupsAssigned: number[], assignmentSkippedReason?: string } | null>(null)
const localIdentities = ref<TeamSpeakIdentityRecord[]>([])

watch(() => props.profile?.teamspeak_identities, (identities) => {
  localIdentities.value = identities ?? []
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
const tokenExpiryDisplay = computed(() => {
  if (!requestResult.value?.tokenExpiresAt)
    return null
  const timestamp = Date.parse(requestResult.value.tokenExpiresAt)
  if (Number.isNaN(timestamp))
    return requestResult.value.tokenExpiresAt
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
})

const serverSelectModel = computed<SelectOption[] | undefined>({
  get() {
    const selection = serverOptions.value.find(option => option.value === form.serverId)
    return selection ? [selection] : undefined
  },
  set(value) {
    form.serverId = value?.[0]?.value ?? ''
  },
})

const identities = computed(() => localIdentities.value)

function handleClose() {
  isOpen.value = false
  emit('close')
}

function resetFlow(targetStep: 'request' | 'confirm' | 'success' = 'request') {
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

  requestLoading.value = true
  formError.value = ''
  try {
    const { data, error } = await supabase.functions.invoke<VerifyRequestResponse>('teamspeak-verify-request', {
      body: {
        uniqueId: form.uniqueId.trim(),
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
    formError.value = error instanceof Error ? error.message : 'Unable to start TeamSpeak verification.'
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
    localIdentities.value = data.identities ?? localIdentities.value
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
</script>

<template>
  <Modal :open="isOpen" centered :card="{ separators: true }" @close="handleClose">
    <template #header>
      <Flex x-between y-center>
        <div>
          <h3>Link TeamSpeak Identity</h3>
          <p class="text-xs text-color-lighter">
            Securely connect your TeamSpeak identity to manage access.
          </p>
        </div>
        <Badge variant="neutral">
          Step {{ step === 'request' ? 1 : step === 'confirm' ? 2 : 3 }} / 3
        </Badge>
      </Flex>
    </template>

    <Flex column gap="l">
      <Alert v-if="!hasServers" variant="danger" filled>
        No TeamSpeak servers are configured. Please contact an administrator.
      </Alert>

      <Alert v-if="formError" variant="danger" filled>
        {{ formError }}
      </Alert>

      <section v-if="step === 'request'" class="link-step">
        <h4>Step 1 — Send Verification Message</h4>
        <p class="text-sm text-color-lighter">
          Enter the TeamSpeak unique ID you want to link. We will send a secure token to your client on the selected server.
        </p>

        <Flex column gap="m">
          <Input
            v-model="form.uniqueId"
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
            show-clear
            expand
          />

          <p v-if="selectedServer" class="text-xs text-color-lighter">
            Connecting via <strong>{{ selectedServer.queryHost ?? 'n/a' }}</strong> on port
            <strong>{{ selectedServer.queryPort ?? 10011 }}</strong> targeting voice port
            <strong>{{ selectedServer.voicePort ?? 'default' }}</strong>.
          </p>
        </Flex>
      </section>

      <section v-else-if="step === 'confirm'" class="link-step">
        <h4>Step 2 — Confirm Token</h4>
        <p class="text-sm text-color-lighter">
          Enter the token you just received in TeamSpeak. Tokens expire quickly, so complete this step soon.
        </p>

        <Alert v-if="tokenExpiryDisplay" variant="info" filled>
          Token sent for server <strong>{{ requestResult?.serverId }}</strong>.
          Expires {{ tokenExpiryDisplay }}.
        </Alert>

        <Input
          v-model="tokenForm.token"
          label="Verification Token"
          placeholder="Enter the token from TeamSpeak"
          :error="fieldErrors.token || undefined"
          :disabled="confirmLoading"
          required
        />
      </section>

      <section v-else class="link-step">
        <h4>All set!</h4>
        <Alert variant="success" filled>
          {{ successMessage }}
        </Alert>
      </section>

      <section class="identity-list">
        <Flex x-between y-center class="identity-list__header">
          <h4>Linked Identities</h4>
          <Badge variant="neutral" size="s">
            {{ identities.length }}
          </Badge>
        </Flex>

        <div v-if="identities.length === 0" class="identity-list__empty">
          <p>You have not linked any TeamSpeak identities yet.</p>
        </div>
        <ul v-else>
          <li v-for="identity in identities" :key="`${identity.serverId}-${identity.uniqueId}`">
            <Flex column gap="xs">
              <Flex gap="s" y-center>
                <Badge variant="info" size="s">
                  {{ identity.serverId.toUpperCase() }}
                </Badge>
                <code class="identity-code">{{ identity.uniqueId }}</code>
              </Flex>
              <span class="text-xs text-color-lighter">
                Linked {{ new Date(identity.linkedAt).toLocaleString() }}
              </span>
            </Flex>
          </li>
        </ul>
      </section>
    </Flex>

    <template #footer>
      <Flex gap="s" x-end wrap>
        <Button variant="gray" :disabled="requestLoading || confirmLoading" @click="handleClose">
          Close
        </Button>

        <Button
          v-if="step === 'request'"
          variant="accent"
          :loading="requestLoading"
          :disabled="!hasServers"
          @click="handleRequest"
        >
          Send Verification
        </Button>

        <template v-else-if="step === 'confirm'">
          <Button variant="gray" :disabled="confirmLoading" @click="resetFlow('request')">
            Start Over
          </Button>
          <Button variant="accent" :loading="confirmLoading" @click="handleConfirm">
            Confirm Token
          </Button>
        </template>

        <template v-else>
          <Button variant="accent" @click="resetFlow('request')">
            Link Another Identity
          </Button>
        </template>
      </Flex>
    </template>
  </Modal>
</template>

<style scoped>
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
</style>
