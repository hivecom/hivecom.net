<script setup lang="ts">
import type { DmHistorySetting } from '@/composables/useIrcChat'
import { Button, Divider, Flex, Input, Modal, Select } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import { useSupabaseUser } from '#imports'
import { useIrcChat } from '@/composables/useIrcChat'
import { useBreakpoint } from '@/lib/mediaQuery'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const isMobile = useBreakpoint('<s')
const { account, accountEmail, accountAlwaysOn, accountDmHistory, accountDmHistoryEffective, accountInfoFetched, enableAlwaysOn, disableAlwaysOn, setDmHistory, claimEmail, verifyClaimCode } = useIrcChat()

// --- DM history ---

const dmHistoryOptions = [
  { label: 'Server default', value: 'default' as DmHistorySetting },
  { label: 'On', value: 'persistent' as DmHistorySetting },
  { label: 'Ephemeral', value: 'ephemeral' as DmHistorySetting },
  { label: 'Off', value: 'disabled' as DmHistorySetting },
]

const dmHistoryModel = computed<{ label: string, value: DmHistorySetting }[] | undefined>({
  get() {
    const match = dmHistoryOptions.find(o => o.value === accountDmHistory.value)
    return match ? [match] : undefined
  },
  set(selection) {
    const value = selection?.[0]?.value
    if (value && value !== accountDmHistory.value)
      setDmHistory(value)
  },
})

// What the preference resolves to. The effective value comes from the server's
// own "Given current server settings" reply, so 'default' reflects actual
// server config instead of a hardcoded assumption.
const dmHistoryEffective = computed(() => accountDmHistoryEffective.value ?? (accountDmHistory.value !== 'default' ? accountDmHistory.value : null))

const dmHistoryDescription = computed(() => {
  const effective = dmHistoryEffective.value
  const state = effective === 'persistent'
    ? 'Direct messages are stored on the server so you can catch up after being offline.'
    : effective === 'ephemeral'
      ? 'A limited amount of recent direct messages is kept in memory, nothing is written to disk.'
      : effective === 'disabled'
        ? 'No direct message history is kept. Messages you miss while offline are lost.'
        : 'Direct message history follows the server default.'
  return accountDmHistory.value === 'default' && effective ? `Server default: ${state.charAt(0).toLowerCase()}${state.slice(1)}` : state
})

// --- Claim flow ---

type ClaimStep = 'idle' | 'email' | 'code' | 'done'
const claimStep = ref<ClaimStep>('idle')
const emailInput = ref('')
const codeInput = ref('')
const claimError = ref('')
const verifying = ref(false)
let verifyTimer: ReturnType<typeof setTimeout> | null = null

const supabaseUser = useSupabaseUser()

const isClaimed = computed(() => {
  if (!accountInfoFetched.value)
    return false
  const email = accountEmail.value
  if (!email)
    return false
  const userEmail = (supabaseUser.value as Record<string, unknown> | null)?.email as string | undefined
  return !userEmail || email === userEmail
})

const isEmailMismatch = computed(() => {
  if (!accountInfoFetched.value)
    return false
  const email = accountEmail.value
  if (!email)
    return false
  const userEmail = (supabaseUser.value as Record<string, unknown> | null)?.email as string | undefined
  return !!userEmail && email !== userEmail
})

// Registered Supabase user with no IRC email linked yet
const isRegisteredNoEmail = computed(() => {
  return accountInfoFetched.value && !!supabaseUser.value && accountEmail.value === ''
})

function startClaim() {
  emailInput.value = (supabaseUser.value as Record<string, unknown> | null)?.email as string ?? ''
  codeInput.value = ''
  claimError.value = ''
  claimStep.value = 'email'
}

function submitEmail() {
  if (!emailInput.value.trim())
    return
  claimError.value = ''
  claimEmail(emailInput.value.trim())
  claimStep.value = 'code'
}

function submitCode() {
  if (!codeInput.value.trim() || verifying.value)
    return
  claimError.value = ''
  verifying.value = true
  verifyClaimCode(codeInput.value.trim())
  verifyTimer = setTimeout(() => {
    verifying.value = false
    claimError.value = 'Code not accepted - check it and try again.'
  }, 6000)
}

watch(accountEmail, (val) => {
  if (claimStep.value !== 'code')
    return
  if (val && val !== '') {
    if (verifyTimer)
      clearTimeout(verifyTimer)
    verifying.value = false
    claimStep.value = 'done'
  }
})

function handleClose() {
  claimStep.value = 'idle'
  claimError.value = ''
  verifying.value = false
  emit('close')
}
</script>

<template>
  <Modal :open="open" :size="isMobile ? 'screen' : 'l'" @close="handleClose">
    <template #header>
      <h4 style="margin: 0">
        Identity
      </h4>
    </template>

    <Flex column gap="l" expand>
      <!-- Always-on -->
      <Flex y-center x-between expand gap="m">
        <Flex column gap="xxs" expand>
          <Flex y-center gap="xs">
            <Icon
              :name="!accountInfoFetched ? 'ph:hourglass' : accountAlwaysOn === true ? 'ph:check-circle' : accountAlwaysOn === false ? 'ph:warning' : 'ph:info'"
              :class="!accountInfoFetched ? 'text-color-lighter' : accountAlwaysOn === true ? 'text-color-green' : accountAlwaysOn === false ? 'text-color-yellow' : 'text-color-lighter'"
            />
            <span class="text-s font-weight-medium">Always-on</span>
          </Flex>
          <span v-if="!accountInfoFetched" class="text-xs text-color-lighter">
            Checking status...
          </span>
          <span v-else-if="accountAlwaysOn === true" class="text-xs text-color-lighter">
            Your account stays joined to channels and accepts direct messages even when you're offline.
          </span>
          <span v-else-if="accountAlwaysOn === false" class="text-xs text-color-lighter">
            Without always-on, you won't receive messages while offline. Enable it to stay reachable.
          </span>
          <span v-else class="text-xs text-color-lighter">
            Checking status...
          </span>
        </Flex>
        <Button v-if="accountInfoFetched && accountAlwaysOn === false" variant="accent" size="s" @click="enableAlwaysOn">
          Enable
        </Button>
        <Button v-else-if="accountInfoFetched && accountAlwaysOn === true" variant="gray" size="s" @click="disableAlwaysOn">
          Disable
        </Button>
      </Flex>

      <Divider />

      <!-- DM history -->
      <Flex y-center x-between expand gap="m">
        <Flex column gap="xxs" expand>
          <Flex y-center gap="xs">
            <Icon
              :name="!accountInfoFetched ? 'ph:hourglass' : 'ph:clock-counter-clockwise'"
              :class="!accountInfoFetched ? 'text-color-lighter' : dmHistoryEffective === 'disabled' ? 'text-color-yellow' : dmHistoryEffective === 'persistent' ? 'text-color-green' : 'text-color-lighter'"
            />
            <span class="text-s font-weight-medium">Message history</span>
          </Flex>
          <span v-if="!accountInfoFetched" class="text-xs text-color-lighter">
            Checking status...
          </span>
          <template v-else>
            <span class="text-xs text-color-lighter">{{ dmHistoryDescription }}</span>
            <span v-if="accountAlwaysOn === false" class="text-xs text-color-yellow">
              Only takes effect while always-on is enabled.
            </span>
          </template>
        </Flex>
        <Select
          v-if="accountInfoFetched"
          v-model="dmHistoryModel"
          :options="dmHistoryOptions"
          single
          size="s"
          style="width: 140px"
        />
      </Flex>

      <Divider />

      <!-- Email / claim -->
      <Flex column gap="s" expand>
        <!-- Status row -->
        <Flex y-center x-between expand gap="m">
          <Flex column gap="xxs" expand>
            <Flex y-center gap="xs">
              <Icon
                :name="!accountInfoFetched ? 'ph:hourglass' : isClaimed ? 'ph:check-circle' : isEmailMismatch ? 'ph:warning-circle' : isRegisteredNoEmail ? 'ph:link' : 'ph:warning'"
                :class="!accountInfoFetched ? 'text-color-lighter' : isClaimed ? 'text-color-green' : isEmailMismatch ? 'text-color-red' : 'text-color-yellow'"
              />
              <span class="text-s font-weight-medium">Account email</span>
            </Flex>
            <span v-if="!accountInfoFetched" class="text-xs text-color-lighter">
              Checking status...
            </span>
            <span v-else-if="isClaimed" class="text-xs text-color-lighter">
              Verified as <strong class="text-xs">{{ accountEmail }}</strong>. Chat and Hivecom identities are in sync.
            </span>
            <span v-else-if="isEmailMismatch" class="text-xs text-color-lighter">
              Chat identity uses <strong class="text-xs">{{ accountEmail }}</strong>, but signed in as <strong class="text-xs">{{ supabaseUser?.email }}</strong>. Re-claim to sync.
            </span>
            <span v-else-if="isRegisteredNoEmail" class="text-xs text-color-lighter">
              Your chat identity has no email linked. Link your Hivecom account to keep both identities in sync.
            </span>
            <span v-else class="text-xs text-color-lighter">
              No email set. Chat and Hivecom have separate identity systems - claim to sign in on any IRC client.
            </span>
          </Flex>
          <Button v-if="accountInfoFetched && (!isClaimed || isEmailMismatch) && claimStep === 'idle'" variant="accent" size="s" @click="startClaim">
            {{ isRegisteredNoEmail ? 'Link' : 'Set up' }}
          </Button>
          <Button v-else-if="accountInfoFetched && isClaimed && claimStep === 'idle'" variant="gray" size="s" @click="startClaim">
            Change
          </Button>
        </Flex>

        <!-- Inline claim flow -->
        <Flex v-if="claimStep === 'email'" column gap="s" class="identity-modal__claim" expand>
          <Flex column gap="xs" expand>
            <label class="text-xs text-color-light">Email address</label>
            <Input v-model="emailInput" expand type="email" placeholder="you@example.com" @keydown.enter="submitEmail" />
          </Flex>
          <Flex gap="xs" x-end>
            <Button size="s" @click="claimStep = 'idle'">
              Cancel
            </Button>
            <Button size="s" variant="accent" :disabled="!emailInput.trim()" @click="submitEmail">
              Send code
            </Button>
          </Flex>
        </Flex>

        <Flex v-else-if="claimStep === 'code'" column gap="s" class="identity-modal__claim" expand>
          <p class="text-xs text-color-lighter">
            A verification code was sent to <strong class="text-s">{{ emailInput }}</strong>. Enter it below.
          </p>
          <Flex column gap="xs" expand>
            <label class="text-xs text-color-light">Verification code</label>
            <Input v-model="codeInput" expand placeholder="Paste code here" :disabled="verifying" @keydown.enter="submitCode" />
          </Flex>
          <p v-if="claimError" class="text-xs text-color-red">
            {{ claimError }}
          </p>
          <Flex gap="xs" x-end>
            <Button size="s" :disabled="verifying" @click="claimStep = 'email'">
              Back
            </Button>
            <Button size="s" variant="accent" :loading="verifying" :disabled="!codeInput.trim()" @click="submitCode">
              Verify
            </Button>
          </Flex>
        </Flex>

        <Flex v-else-if="claimStep === 'done'" column gap="s" class="identity-modal__claim" expand>
          <p class="text-xs text-color-lighter">
            Email <strong class="text-xs">{{ accountEmail }}</strong> verified. Account claimed.
          </p>
          <p class="text-s text-color-light">
            To set a password for legacy IRC clients:
            <code style="color: var(--color-text)">/msg NickServ SENDPASS {{ account }}</code>
          </p>
        </Flex>
      </Flex>
    </Flex>
  </Modal>
</template>

<style lang="scss" scoped>
.identity-modal {
  &__claim {
    padding: var(--space-s);
    background: var(--color-bg-lowered);
    border-radius: var(--border-radius-m);
    border: 1px solid var(--color-border);
  }
}
</style>
