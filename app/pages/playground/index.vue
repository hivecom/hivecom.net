<script setup lang="ts">
import { Alert, Badge, Button, Card, Flex, Input, pushToast, Select, Textarea } from '@dolanske/vui'
import { computed, reactive, ref, watch } from 'vue'

import constants from '~~/constants.json'

interface TeamSpeakServerConfig {
  id: string
  title?: string
  queryHost?: string
  queryPort?: number
  voicePort?: number
  botNickname?: string
  note?: string
}

interface SelectOption {
  label: string
  value: string
  description?: string
}

interface InvokeResult {
  status: string
  serverId: string
  clientId: number
  uniqueId: string
  requestedBy?: string
}

const MESSAGE_LIMIT = 512
const MIN_UNIQUE_ID = 5

const supabase = useSupabaseClient()
const user = useSupabaseUser()

const teamspeakServers = computed<TeamSpeakServerConfig[]>(() => constants.PLATFORMS?.TEAMSPEAK?.servers ?? [])

const form = reactive({
  uniqueId: '',
  message: '',
  serverId: teamspeakServers.value[0]?.id ?? '',
})

watch(
  () => teamspeakServers.value,
  (servers) => {
    if (!form.serverId && servers.length) {
      const firstServer = servers[0]
      if (firstServer)
        form.serverId = firstServer.id
    }
  },
  { immediate: true },
)

const fieldErrors = reactive({
  uniqueId: '',
  message: '',
})

const isAuthenticated = computed(() => Boolean(user.value))
const loading = ref(false)
const formError = ref('')
const result = ref<InvokeResult | null>(null)

const serverOptions = computed<SelectOption[]>(() => teamspeakServers.value.map(server => ({
  label: server.title ?? server.id.toUpperCase(),
  value: server.id,
  description: [server.queryHost, server.voicePort ?? server.queryPort].filter(Boolean).join(':') || undefined,
})))

const hasServers = computed(() => serverOptions.value.length > 0)

const serverSelectModel = computed<SelectOption[] | undefined>({
  get() {
    const selection = serverOptions.value.find(option => option.value === form.serverId)
    return selection ? [selection] : undefined
  },
  set(value) {
    form.serverId = value?.[0]?.value ?? ''
  },
})

const selectedServer = computed(() => teamspeakServers.value.find(server => server.id === form.serverId) ?? null)
const messageCharCount = computed(() => form.message.length)

const canSubmit = computed(() => hasServers.value && isAuthenticated.value && Boolean(form.uniqueId.trim()) && Boolean(form.message.trim()) && Boolean(form.serverId))

function resetErrors() {
  fieldErrors.uniqueId = ''
  fieldErrors.message = ''
  formError.value = ''
}

function validateForm() {
  resetErrors()
  let isValid = true

  if (!form.uniqueId.trim()) {
    fieldErrors.uniqueId = 'A TeamSpeak unique ID is required.'
    isValid = false
  }
  else if (form.uniqueId.trim().length < MIN_UNIQUE_ID) {
    fieldErrors.uniqueId = `Unique IDs must be at least ${MIN_UNIQUE_ID} characters.`
    isValid = false
  }

  if (!form.message.trim()) {
    fieldErrors.message = 'Message content is required.'
    isValid = false
  }

  if (!form.serverId) {
    formError.value = 'Please choose a destination server.'
    isValid = false
  }

  if (!hasServers.value) {
    formError.value = 'No TeamSpeak servers are configured in constants.json.'
    isValid = false
  }

  return isValid
}

async function handleSend() {
  if (!canSubmit.value)
    return

  if (!validateForm())
    return

  loading.value = true
  formError.value = ''
  result.value = null

  try {
    const { data, error } = await supabase.functions.invoke<InvokeResult>('teamspeak-verify-request', {
      body: {
        uniqueId: form.uniqueId.trim(),
        message: form.message.trim(),
        serverId: form.serverId,
      },
    })

    if (error)
      throw error

    if (!data)
      throw new Error('No response from edge function.')

    result.value = data
    pushToast('Message handed off to TeamSpeak.')
  }
  catch (error) {
    console.error('Failed to send TeamSpeak message', error)
    formError.value = error instanceof Error ? error.message : 'Failed to reach TeamSpeak.'
  }
  finally {
    loading.value = false
  }
}

function resetForm() {
  form.uniqueId = ''
  form.message = ''
  result.value = null
  resetErrors()
}
</script>

<template>
  <div class="page">
    <section class="page-title">
      <div>
        <h1>Playground</h1>
        <p>Manually trigger the TeamSpeak verification edge function in a safe environment.</p>
      </div>
    </section>

    <ClientOnly>
      <Card separators class="playground-card">
        <template #header>
          <Flex x-between y-center gap="s" wrap>
            <div>
              <h3>TeamSpeak Verification Tester</h3>
              <p class="text-xs text-color-lighter">
                Send a targeted text message through the edge function to confirm connectivity.
              </p>
            </div>
            <Badge :variant="result ? 'success' : 'warning'" size="s">
              {{ result ? 'Last run succeeded' : 'Awaiting test' }}
            </Badge>
          </Flex>
        </template>

        <Flex column gap="l">
          <Alert v-if="!isAuthenticated" variant="warning" filled>
            You must sign in to run TeamSpeak verification requests.
          </Alert>

          <Alert v-else-if="!hasServers" variant="danger" filled>
            No TeamSpeak servers are configured. Update <code>constants.json</code> to continue.
          </Alert>

          <Flex expand column gap="m">
            <Input
              v-model="form.uniqueId"
              expand
              label="TeamSpeak Unique ID"
              placeholder="e.g. Nc4M5c9yWlWdrtG19Kk7H7y0X0w="
              :error="fieldErrors.uniqueId || undefined"
              :disabled="!isAuthenticated"
              required
            />

            <Textarea
              v-model="form.message"
              expand
              label="Message"
              placeholder="Enter the verification text you want to deliver"
              :rows="5"
              :maxlength="MESSAGE_LIMIT"
              :error="fieldErrors.message || undefined"
              :disabled="!isAuthenticated"
              required
            >
              <template #after>
                <div class="text-xs text-color-lighter">
                  {{ messageCharCount }}/{{ MESSAGE_LIMIT }} characters
                </div>
              </template>
            </Textarea>

            <Select
              v-model="serverSelectModel"
              label="Destination Server"
              placeholder="Select a TeamSpeak server"
              :options="serverOptions"
              :disabled="!isAuthenticated || !hasServers"
              single
              search
              show-clear
              expand
            />

            <p v-if="selectedServer" class="server-hint text-xs">
              Connecting via query host <strong>{{ selectedServer.queryHost ?? 'n/a' }}</strong>
              on port <strong>{{ selectedServer.queryPort ?? 10011 }}</strong> and targeting voice port
              <strong>{{ selectedServer.voicePort ?? 'default' }}</strong>.
            </p>
          </Flex>

          <Alert v-if="formError" variant="danger" filled>
            {{ formError }}
          </Alert>

          <Alert v-if="result" variant="success" filled>
            Delivered to client ID <strong>{{ result.clientId }}</strong> on server <strong>{{ result.serverId }}</strong> using unique ID
            <code>{{ result.uniqueId }}</code>.
          </Alert>

          <Flex gap="s" wrap class="form-actions">
            <Button
              variant="accent"
              :disabled="!canSubmit || loading"
              :loading="loading"
              @click="handleSend"
            >
              <template #start>
                <Icon name="ph:paper-plane-tilt" />
              </template>
              Send Test Message
            </Button>

            <Button variant="link" :disabled="loading" @click="resetForm">
              Reset
            </Button>
          </Flex>
        </Flex>
      </Card>

      <template #fallback>
        <div class="playground-card playground-card--fallback">
          Preparing the playground…
        </div>
      </template>
    </ClientOnly>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.playground-card {
  max-width: 720px;
}

.playground-card--fallback {
  border: 1px dashed var(--color-border, #3a3a3a);
  padding: 1.5rem;
  border-radius: 1rem;
  color: var(--color-text-muted, #a0a0a0);
}

.server-hint {
  color: var(--color-text-muted, #a0a0a0);
}

.form-actions {
  justify-content: flex-start;
}
</style>
