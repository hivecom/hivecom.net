<script setup lang="ts">
import { Button, Divider, Flex, Input, Modal } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import { useSupabaseUser } from '#imports'
import { useIrcChat } from '@/composables/useIrcChat'
import { useBreakpoint } from '@/lib/mediaQuery'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const isMobile = useBreakpoint('<s')
const { account, accountEmail, accountAlwaysOn, enableAlwaysOn, disableAlwaysOn, claimEmail, verifyClaimCode } = useIrcChat()

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
  const email = accountEmail.value
  if (!email)
    return false
  const userEmail = (supabaseUser.value as Record<string, unknown> | null)?.email as string | undefined
  return !userEmail || email === userEmail
})

const isEmailMismatch = computed(() => {
  const email = accountEmail.value
  if (!email)
    return false
  const userEmail = (supabaseUser.value as Record<string, unknown> | null)?.email as string | undefined
  return !!userEmail && email !== userEmail
})

// Registered Supabase user with no IRC email linked yet
const isRegisteredNoEmail = computed(() => {
  return !!supabaseUser.value && accountEmail.value === ''
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
      <h4>Identity</h4>
    </template>

    <Flex column gap="l" expand>
      <!-- Always-on -->
      <Flex y-center x-between expand gap="m">
        <Flex column gap="xxs" expand>
          <Flex y-center gap="xs">
            <Icon
              :name="accountAlwaysOn === true ? 'ph:check-circle' : accountAlwaysOn === false ? 'ph:warning' : 'ph:info'"
              :class="accountAlwaysOn === true ? 'text-color-green' : accountAlwaysOn === false ? 'text-color-yellow' : 'text-color-lighter'"
            />
            <span class="text-s font-weight-medium">Always-on</span>
          </Flex>
          <span v-if="accountAlwaysOn === true" class="text-xs text-color-lighter">
            Your account stays joined to channels and accepts direct messages even when you're offline.
          </span>
          <span v-else-if="accountAlwaysOn === false" class="text-xs text-color-lighter">
            Without always-on, you won't receive messages while offline. Enable it to stay reachable.
          </span>
          <span v-else class="text-xs text-color-lighter">
            Checking status...
          </span>
        </Flex>
        <Button v-if="accountAlwaysOn === false" variant="accent" size="s" @click="enableAlwaysOn">
          Enable
        </Button>
        <Button v-else-if="accountAlwaysOn === true" variant="gray" size="s" @click="disableAlwaysOn">
          Disable
        </Button>
      </Flex>

      <Divider />

      <!-- Email / claim -->
      <Flex column gap="s" expand>
        <!-- Status row -->
        <Flex y-center x-between expand gap="m">
          <Flex column gap="xxs" expand>
            <Flex y-center gap="xs">
              <Icon
                :name="isClaimed ? 'ph:check-circle' : isEmailMismatch ? 'ph:warning-circle' : isRegisteredNoEmail ? 'ph:link' : 'ph:warning'"
                :class="isClaimed ? 'text-color-green' : isEmailMismatch ? 'text-color-red' : 'text-color-yellow'"
              />
              <span class="text-s font-weight-medium">Account email</span>
            </Flex>
            <span v-if="isClaimed" class="text-xs text-color-lighter">
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
          <Button v-if="(!isClaimed || isEmailMismatch) && claimStep === 'idle'" variant="accent" size="s" @click="startClaim">
            {{ isRegisteredNoEmail ? 'Link' : 'Set up' }}
          </Button>
          <Button v-else-if="isClaimed && claimStep === 'idle'" variant="gray" size="s" @click="startClaim">
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
