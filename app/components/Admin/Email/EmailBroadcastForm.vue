<script setup lang="ts">
import type { BroadcastTemplate } from './broadcastTemplates'
import type { BroadcastMode, BroadcastRecipients, BroadcastResult } from '@/composables/useEmailAdmin'
import { Alert, Button, Card, Flex, Input, Modal, pushToast, Select, Switch } from '@dolanske/vui'
import { watchDebounced } from '@vueuse/core'
import { marked } from 'marked'
import { computed, ref } from 'vue'
import RichTextEditor from '@/components/Editor/RichTextEditor.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { useEmailAdmin } from '@/composables/useEmailAdmin'
import { useBreakpoint } from '@/lib/mediaQuery'
// The email shell lives next to the hand-crafted auth templates in supabase/
// so the edge function and this preview render from the same source.
import { renderBroadcastEmail } from '../../../../supabase/email/broadcast'
import { BROADCAST_TEMPLATES } from './broadcastTemplates'

interface SelectOption {
  label: string
  value: string
}

const props = defineProps<{
  // Live recipient counts from the overview, null while loading or unavailable.
  recipients: BroadcastRecipients | null
}>()

const emit = defineEmits<{
  // Fired after any send completes so the page can refresh the quota cards.
  sent: []
}>()

const { sendBroadcast } = useEmailAdmin()
const isBelowSmall = useBreakpoint('<xs')
const isStacked = useBreakpoint('<m')

// The word an admin has to type before the send-to-everyone button unlocks.
const CONFIRM_WORD = 'SEND'
const WHITESPACE_RE = /\s+/g

const subject = ref('')
const body = ref('')

// Content alignment inside the email shell. Centered matches the hand-crafted
// transactional templates, so it's the default.
const centered = ref(true)

// Which send is in flight, so both buttons can disable while either runs.
const sending = ref<BroadcastMode | null>(null)
const result = ref<BroadcastResult | null>(null)
const errorMessage = ref('')

const confirmOpen = ref(false)
const confirmWord = ref('')

const canSend = computed(() => subject.value.trim().length > 0 && body.value.trim().length > 0)
const confirmMatches = computed(() => confirmWord.value.trim() === CONFIRM_WORD)

// The HTML part of the mail. breaks is on because people write broadcasts like
// chat messages, and a single newline swallowed into one paragraph reads wrong.
// This is the inner body only - the edge function wraps it in the email shell.
const renderedHtml = computed(() => marked.parse(body.value, { async: false, gfm: true, breaks: true }))

// ── Preview ──────────────────────────────────────────────────────────────────

const previewSource = computed(() => renderBroadcastEmail(
  subject.value.trim() || 'Your subject goes here',
  renderedHtml.value || '<p style="color: #888">Nothing written yet.</p>',
  { centered: centered.value },
))

// Rebuilding the iframe document on every keystroke makes typing stutter, so
// the srcdoc trails the editor by a beat.
const previewHtml = ref(previewSource.value)
watchDebounced(previewSource, (value) => {
  previewHtml.value = value
}, { debounce: 300 })

// ── Templates ────────────────────────────────────────────────────────────────

const templateOptions: SelectOption[] = BROADCAST_TEMPLATES.map(template => ({
  label: template.name,
  value: template.id,
}))

const selectedTemplate = ref<SelectOption[]>([])
const appliedTemplateId = ref<string | null>(null)
const pendingTemplate = ref<BroadcastTemplate | null>(null)
const templateConfirmOpen = ref(false)

const selectedTemplateDescription = computed(() => {
  const id = selectedTemplate.value[0]?.value
  return BROADCAST_TEMPLATES.find(template => template.id === id)?.description ?? ''
})

function normalize(value: string): string {
  return value.replace(WHITESPACE_RE, ' ').trim()
}

// The editor round-trips markdown through tiptap, so an applied template comes
// back with slightly different whitespace. Compare loosely: the worst case is
// one extra confirm dialog, never a draft wiped without asking.
function hasDraft(): boolean {
  const applied = BROADCAST_TEMPLATES.find(template => template.id === appliedTemplateId.value)
  return normalize(subject.value) !== normalize(applied?.subject ?? '')
    || normalize(body.value) !== normalize(applied?.markdown ?? '')
}

function applyTemplate(template: BroadcastTemplate) {
  subject.value = template.subject
  body.value = template.markdown
  appliedTemplateId.value = template.id
  selectedTemplate.value = [{ label: template.name, value: template.id }]
}

function pickTemplate(value: SelectOption[] | undefined) {
  const option = value?.[0]

  if (!option) {
    selectedTemplate.value = []
    return
  }

  const template = BROADCAST_TEMPLATES.find(entry => entry.id === option.value)
  if (!template)
    return

  if (hasDraft()) {
    // Hold the selection back until the admin says it's fine to overwrite.
    pendingTemplate.value = template
    templateConfirmOpen.value = true
    return
  }

  applyTemplate(template)
}

function confirmTemplate() {
  if (pendingTemplate.value)
    applyTemplate(pendingTemplate.value)
  pendingTemplate.value = null
  templateConfirmOpen.value = false
}

function cancelTemplate() {
  pendingTemplate.value = null
  templateConfirmOpen.value = false
}

// ── Sending ──────────────────────────────────────────────────────────────────

function resetSendState() {
  errorMessage.value = ''
  result.value = null
}

async function send(mode: BroadcastMode) {
  if (!canSend.value || sending.value !== null)
    return

  sending.value = mode
  resetSendState()

  try {
    // Recipients get the raw markdown as the text part and the rendered inner
    // HTML as the HTML part, so both halves of the mail say the same thing.
    const outcome = await sendBroadcast(subject.value.trim(), body.value, renderedHtml.value, mode, centered.value)

    if (mode === 'test') {
      pushToast(
        outcome.failed > 0 ? 'Test send failed' : 'Test sent to your address',
        { description: outcome.failed > 0 ? outcome.failures[0]?.error : undefined },
      )
    }
    else {
      result.value = outcome
      confirmOpen.value = false
      confirmWord.value = ''
      pushToast(
        outcome.failed > 0 ? 'Broadcast finished with failures' : 'Broadcast sent',
        { description: `${outcome.sent} of ${outcome.total} delivered` },
      )
    }
    // Even a test consumes quota, so the page refreshes the cards either way.
    emit('sent')
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to send the broadcast'
    pushToast(mode === 'test' ? 'Could not send the test' : 'Could not send the broadcast', {
      description: errorMessage.value,
    })
  }
  finally {
    sending.value = null
  }
}

// "418 members" when the count is known, the generic phrasing when it isn't.
const recipientPhrase = computed(() => {
  if (props.recipients === null)
    return 'every member with an email address, minus the suppressed ones'
  const count = props.recipients.eligible.toLocaleString()
  return props.recipients.suppressed > 0
    ? `${count} members (${props.recipients.suppressed.toLocaleString()} suppressed addresses are skipped)`
    : `${count} members`
})

function openConfirm() {
  if (!canSend.value)
    return
  confirmWord.value = ''
  confirmOpen.value = true
}

function closeConfirm() {
  if (sending.value === 'send')
    return
  confirmOpen.value = false
  confirmWord.value = ''
}
</script>

<template>
  <Flex column gap="l" expand>
    <Flex :column="isStacked" gap="l" expand y-start class="broadcast-columns">
      <div class="broadcast-column">
        <Card separators class="card-bg">
          <template #header>
            <Flex column gap="xxs">
              <h3>Compose broadcast</h3>
              <p class="text-color-light text-m">
                Goes to {{ recipientPhrase }}
              </p>
            </Flex>
          </template>

          <Flex column gap="m" expand>
            <Select
              single
              expand
              :model-value="selectedTemplate"
              :options="templateOptions"
              label="Start from a template"
              placeholder="Blank"
              :hint="selectedTemplateDescription || 'Fills the subject and body. Placeholders in brackets need replacing.'"
              show-clear
              :disabled="sending !== null"
              @update:model-value="pickTemplate"
            />

            <Input
              v-model="subject"
              expand
              label="Subject"
              placeholder="What's this about?"
              hint="Also becomes the heading at the top of the email"
              :disabled="sending !== null"
            />

            <RichTextEditor
              v-model="body"
              label="Body"
              placeholder="Write the announcement"
              hint="Markdown. Formatting and links carry over into the email."
              min-height="320px"
              max-height="50vh"
              :disabled="sending !== null"
              :show-attachment-button="false"
              :show-submit-options="false"
              :show-expand-button="false"
            />

            <Switch
              v-model="centered"
              class="reversed"
              label="Center content"
              hint="Matches the look of our transactional emails. Turn off for left-aligned long-form text."
              :disabled="sending !== null"
            />
          </Flex>

          <template #footer>
            <Flex gap="xs" :column="isBelowSmall" :expand="isBelowSmall">
              <Button
                :expand="isBelowSmall"
                :disabled="!canSend || sending !== null"
                :loading="sending === 'test'"
                @click="send('test')"
              >
                <template #start>
                  <Icon name="ph:flask" />
                </template>
                Send test to yourself
              </Button>

              <Button
                variant="danger"
                :expand="isBelowSmall"
                :disabled="!canSend || sending !== null"
                @click="openConfirm"
              >
                <template #start>
                  <Icon name="ph:megaphone" />
                </template>
                Send to all members
              </Button>
            </Flex>
          </template>
        </Card>
      </div>

      <div class="broadcast-column">
        <Card separators class="card-bg">
          <template #header>
            <Flex column gap="xxs">
              <h3>Preview</h3>
              <p class="text-color-light text-m">
                Exactly the email that lands in the inbox
              </p>
            </Flex>
          </template>

          <iframe
            title="Broadcast preview"
            class="broadcast-preview"
            :srcdoc="previewHtml"
            sandbox=""
          />
        </Card>
      </div>
    </Flex>

    <Alert v-if="errorMessage" variant="danger">
      {{ errorMessage }}
    </Alert>

    <Card v-if="result" separators class="card-bg">
      <template #header>
        <h3>{{ result.failed > 0 ? 'Sent with failures' : 'Send complete' }}</h3>
      </template>

      <Flex column gap="m" expand>
        <Flex gap="l" wrap>
          <Flex column :gap="0">
            <span class="text-color-light text-s">Recipients</span>
            <span class="broadcast-result__value">{{ result.total.toLocaleString() }}</span>
          </Flex>
          <Flex column :gap="0">
            <span class="text-color-light text-s">Sent</span>
            <span class="broadcast-result__value">{{ result.sent.toLocaleString() }}</span>
          </Flex>
          <Flex column :gap="0">
            <span class="text-color-light text-s">Skipped</span>
            <span class="broadcast-result__value">{{ result.skipped.toLocaleString() }}</span>
          </Flex>
          <Flex column :gap="0">
            <span class="text-color-light text-s">Failed</span>
            <span class="broadcast-result__value">{{ result.failed.toLocaleString() }}</span>
          </Flex>
        </Flex>

        <Alert v-if="result.skipped > 0" variant="info">
          {{ result.skipped }} address{{ result.skipped === 1 ? ' was' : 'es were' }} skipped for being flagged as bounced.
        </Alert>

        <Flex v-if="result.failures.length > 0" column gap="xs" expand>
          <span class="text-color-light text-s">Failures</span>
          <Flex v-for="failure in result.failures" :key="failure.email" column :gap="0" expand class="broadcast-result__failure">
            <span class="text-bold text-s">{{ failure.email }}</span>
            <span class="text-color-light text-s">{{ failure.error }}</span>
          </Flex>
        </Flex>
      </Flex>
    </Card>

    <ConfirmModal
      :open="templateConfirmOpen"
      title="Replace what you've written"
      :description="`Loading ${pendingTemplate?.name ?? 'this template'} overwrites the current subject and body.`"
      confirm-text="Replace"
      cancel-text="Keep my draft"
      destructive
      @cancel="cancelTemplate"
      @confirm="confirmTemplate"
    />

    <!-- Mirrors ConfirmModal's shape, but that component can't gate its confirm
    button on typed input, so the dialog is built out here. -->
    <Modal
      :open="confirmOpen"
      centered
      :card="{ footerSeparator: true }"
      :can-dismiss="false"
      :size="isBelowSmall ? 'screen' : 's'"
      @close="closeConfirm"
    >
      <template #header>
        <Flex column gap="s">
          <h4>Send to all members</h4>
          <p>This mails {{ recipientPhrase }}. It can't be recalled once it goes out.</p>
        </Flex>
      </template>

      <Flex column gap="m" expand>
        <Flex column :gap="0" expand class="broadcast-confirm__subject">
          <span class="text-color-light text-s">Subject</span>
          <span class="text-bold">{{ subject }}</span>
        </Flex>

        <Input
          v-model="confirmWord"
          expand
          label="Type SEND to confirm"
          :placeholder="CONFIRM_WORD"
        />
      </Flex>

      <template #footer>
        <Flex gap="xs" expand x-end>
          <Button :expand="isBelowSmall" :disabled="sending === 'send'" @click="closeConfirm">
            Cancel
          </Button>
          <Button
            variant="danger"
            :expand="isBelowSmall"
            :disabled="!confirmMatches || sending !== null"
            :loading="sending === 'send'"
            @click="send('send')"
          >
            Send now
          </Button>
        </Flex>
      </template>
    </Modal>
  </Flex>
</template>

<style scoped lang="scss">
.broadcast-columns {
  align-items: flex-start;
}

.broadcast-column {
  flex: 1 1 0;
  // Without this the editor and the iframe force the column wider than half.
  min-width: 0;
  width: 100%;
}

.broadcast-preview {
  display: block;
  width: 100%;
  height: clamp(480px, calc(100vh - 320px), 900px);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  background-color: #0e0e0e;
}

.broadcast-result {
  &__value {
    font-size: var(--font-size-l);
    font-weight: var(--font-weight-bold);
  }

  &__failure {
    padding: var(--space-xs) 0;
    border-bottom: 1px solid var(--color-border);
  }
}

.broadcast-confirm__subject {
  padding: var(--space-s);
  border-radius: var(--border-radius-m);
  background-color: var(--color-bg-medium);
}
</style>
