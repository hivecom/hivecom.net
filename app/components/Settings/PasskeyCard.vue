<script setup lang="ts">
import type { EnrolledPasskey } from '@/lib/passkey'
import { Alert, Button, Card, Flex, Input, Modal, Skeleton, Spinner } from '@dolanske/vui'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import { beginPasskeyRegistration, completePasskeyRegistration, deletePasskey, listPasskeys, PASSKEY_NOT_AVAILABLE } from '@/lib/passkey'
import TinyBadge from '../Shared/TinyBadge.vue'

const isBelowSmall = useBreakpoint('<s')
const supabase = useSupabaseClient()

const loading = ref(false)
const hasFetched = ref(false)
const backendPending = ref(false)
const passkeyError = ref('')
const passkeys = ref<EnrolledPasskey[]>([])

const passkeySetup = reactive({
  open: false,
  name: '',
  enrolling: false,
  error: '',
})

const removeModalOpen = ref(false)
const removeLoading = ref(false)
const removeError = ref('')
const removeTarget = ref<EnrolledPasskey | null>(null)

const showSkeleton = computed(() => loading.value && !hasFetched.value)

// TODO: read from useRuntimeConfig() once wiring up real fetch calls
const projectUrl = ''

async function loadPasskeys() {
  loading.value = true
  passkeyError.value = ''
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session)
      return
    passkeys.value = await listPasskeys(projectUrl, session.access_token)
  }
  catch (err) {
    if (err === PASSKEY_NOT_AVAILABLE) {
      backendPending.value = true
    }
    else {
      passkeyError.value = err instanceof Error ? err.message : 'Failed to load passkeys.'
    }
  }
  finally {
    loading.value = false
    hasFetched.value = true
  }
}

function nextPasskeyName(): string {
  return `Passkey ${passkeys.value.length + 1}`
}

function openAddPasskey() {
  passkeySetup.open = true
  passkeySetup.name = ''
  passkeySetup.error = ''
  passkeySetup.enrolling = false
}

function cancelPasskeySetup() {
  if (passkeySetup.enrolling)
    return
  passkeySetup.open = false
  passkeySetup.name = ''
  passkeySetup.error = ''
}

async function addPasskey() {
  if (passkeySetup.enrolling)
    return

  passkeySetup.enrolling = true
  passkeySetup.error = ''

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session)
      throw new Error('Not authenticated.')

    const name = passkeySetup.name.trim() || nextPasskeyName()

    // Step 1: get registration options from server
    const options = await beginPasskeyRegistration(projectUrl, session.access_token)

    // Step 2: browser WebAuthn prompt (requires @simplewebauthn/browser)
    // TODO: import { startRegistration } from '@simplewebauthn/browser'
    // const credential = await startRegistration(options)
    const credential = options // placeholder - remove when wiring up

    // Step 3: complete registration on server
    const enrolled = await completePasskeyRegistration(projectUrl, session.access_token, credential, name)

    passkeys.value = [...passkeys.value, enrolled]
    passkeySetup.open = false
  }
  catch (err) {
    if (err === PASSKEY_NOT_AVAILABLE) {
      passkeySetup.error = 'Passkey backend not yet available - Supabase Auth v2.188.0+ required on the hosted project.'
    }
    else {
      passkeySetup.error = err instanceof Error ? err.message : 'Failed to register passkey.'
    }
  }
  finally {
    passkeySetup.enrolling = false
  }
}

function requestRemove(passkey: EnrolledPasskey) {
  removeTarget.value = passkey
  removeError.value = ''
  removeModalOpen.value = true
}

async function removeSelectedPasskey() {
  if (!removeTarget.value)
    return
  removeLoading.value = true
  removeError.value = ''
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session)
      throw new Error('Not authenticated.')
    await deletePasskey(projectUrl, session.access_token, removeTarget.value.id)
    passkeys.value = passkeys.value.filter(p => p.id !== removeTarget.value?.id)
    removeModalOpen.value = false
  }
  catch (err) {
    removeError.value = err instanceof Error ? err.message : 'Failed to remove passkey.'
  }
  finally {
    removeLoading.value = false
  }
}

function passkeyDisplayName(passkey: EnrolledPasskey): string {
  return passkey.name ?? 'Unnamed passkey'
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const removeModalTitle = computed(() =>
  removeTarget.value != null
    ? `Remove "${passkeyDisplayName(removeTarget.value)}"?`
    : 'Remove passkey',
)

const removeModalDescription = 'This passkey will be permanently removed. You will no longer be able to sign in with it.'

onMounted(() => {
  void loadPasskeys()
})
</script>

<template>
  <Card separators class="card-bg">
    <template #header>
      <Flex x-between y-center>
        <h4>Passkeys</h4>
        <TinyBadge variant="info">
          Dev preview
        </TinyBadge>
      </Flex>
    </template>

    <Flex column gap="l">
      <Flex v-if="showSkeleton" class="security-panel" gap="l" wrap expand>
        <Flex gap="m" y-center class="security-panel__content">
          <div class="security-panel__icon">
            <Skeleton width="28px" height="28px" />
          </div>
          <Flex column gap="xs" expand>
            <Skeleton width="32%" height="1rem" />
            <Skeleton width="66%" height="0.95rem" />
            <Skeleton width="48%" height="0.95rem" />
          </Flex>
        </Flex>
        <Flex :column="isBelowSmall" gap="s" class="security-panel__actions">
          <Skeleton :width="isBelowSmall ? '100%' : '148px'" height="2.25rem" />
        </Flex>
      </Flex>

      <template v-else>
        <Flex class="security-panel" gap="l" expand y-center>
          <Flex gap="m" y-center class="security-panel__content" expand :column="isBelowSmall" :x-between="!isBelowSmall">
            <Flex :column="isBelowSmall" :x-center="isBelowSmall" :expand="isBelowSmall">
              <Flex :expand="isBelowSmall" x-center>
                <div class="security-panel__icon" :class="{ 'is-active': passkeys.length > 0 }">
                  <Icon name="ph:fingerprint" size="28" />
                </div>
              </Flex>
              <Flex column gap="xxs" :y-center="isBelowSmall" :expand="isBelowSmall">
                <Flex gap="s" y-center wrap>
                  <strong>{{ passkeys.length > 0 ? 'Enrolled' : 'Not enrolled' }}</strong>
                  <TinyBadge :variant="passkeys.length > 0 ? 'success' : 'neutral'">
                    <Icon
                      name="ph:fingerprint"
                      :class="passkeys.length > 0 ? 'text-color-accent' : ''"
                    />
                    {{ passkeys.length > 0 ? `${passkeys.length} passkey${passkeys.length === 1 ? '' : 's'}` : 'None' }}
                  </TinyBadge>
                </Flex>
                <p :class="`text-m text-color-lighter${isBelowSmall ? ' text-center' : ''}`">
                  Passwordless sign in with biometrics, a PIN, or a hardware key.
                </p>
              </Flex>
            </Flex>
            <Button
              :expand="isBelowSmall"
              variant="accent"
              @click="openAddPasskey"
            >
              Add passkey
            </Button>
          </Flex>
        </Flex>

        <div v-if="passkeys.length > 0" class="w-100">
          <Flex column gap="s" expand>
            <Flex x-between y-center wrap expand>
              <strong>Your passkeys</strong>
              <span class="text-xs text-color-lighter">{{ passkeys.length }} enrolled</span>
            </Flex>

            <Flex column gap="xs" class="device-list" expand>
              <Flex
                v-for="passkey in passkeys"
                :key="passkey.id"
                expand
                class="device-row"
                x-between
                y-center
              >
                <Flex gap="xs" expand column>
                  <strong class="text-s">{{ passkeyDisplayName(passkey) }}</strong>
                  <Flex gap="xs" y-center>
                    <span class="text-xs text-color-lighter">Added {{ formatDate(passkey.created_at) }}</span>
                    <template v-if="passkey.last_used_at != null">
                      <span class="text-xs text-color-lighter">•</span>
                      <span class="text-xs text-color-lighter">Last used {{ formatDate(passkey.last_used_at) }}</span>
                    </template>
                  </Flex>
                </Flex>

                <Button
                  variant="danger"
                  plain
                  size="s"
                  square
                  :expand="isBelowSmall"
                  :disabled="removeLoading"
                  @click="requestRemove(passkey)"
                >
                  <Icon name="ph:trash" class="text-color-red" />
                </Button>
              </Flex>
            </Flex>
          </Flex>
        </div>

        <Alert v-if="passkeyError" filled variant="danger">
          {{ passkeyError }}
        </Alert>
        <Alert v-if="removeError" filled variant="danger">
          {{ removeError }}
        </Alert>
      </template>
    </Flex>
  </Card>

  <!-- Add passkey -->
  <Modal
    :open="passkeySetup.open"
    size="s"
    :card="{ separators: true }"
    :can-dismiss="!passkeySetup.enrolling"
    @close="cancelPasskeySetup"
  >
    <template #header>
      <Flex column gap="xxs">
        <h4>Add passkey</h4>
        <p class="text-m text-color-light">
          {{ passkeySetup.enrolling
            ? 'Follow the prompts in your browser to complete registration.'
            : 'Give your passkey a name so you can identify it later.'
          }}
        </p>
      </Flex>
    </template>

    <Alert v-if="passkeySetup.error" filled variant="danger" class="mb-m">
      {{ passkeySetup.error }}
    </Alert>

    <Flex v-if="passkeySetup.enrolling" column gap="m" x-center y-center class="passkey-pending">
      <Spinner size="l" />
    </Flex>

    <template v-else>
      <Input
        v-model="passkeySetup.name"
        expand
        name="passkey-name"
        label="Passkey name"
        :placeholder="nextPasskeyName()"
      />
    </template>

    <template #footer>
      <Flex gap="s" :column="isBelowSmall" :row="!isBelowSmall" expand y-center>
        <Button expand variant="accent" :loading="passkeySetup.enrolling" @click="addPasskey">
          Register passkey
        </Button>
        <Button expand :disabled="passkeySetup.enrolling" @click="cancelPasskeySetup">
          Cancel
        </Button>
      </Flex>
    </template>
  </Modal>

  <!-- Remove passkey confirmation -->
  <ConfirmModal
    v-model:open="removeModalOpen"
    :confirm="removeSelectedPasskey"
    :title="removeModalTitle"
    :description="removeModalDescription"
    confirm-text="Remove"
    cancel-text="Cancel"
    :destructive="true"
  />
</template>

<style scoped lang="scss">
.security-panel {
  width: 100%;
  padding: var(--space-m);
  border-radius: var(--border-radius-l);
  border: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.security-panel__icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--color-bg, #0e1018);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--color-border);
}

.security-panel__icon.is-active {
  border-color: var(--color-accent);

  .iconify {
    color: var(--color-accent);
  }
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

.passkey-pending {
  padding: var(--space-xl) 0;
}
</style>
