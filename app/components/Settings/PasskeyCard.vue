<script setup lang="ts">
import type { EnrolledPasskey } from '@/lib/passkey'
import { Alert, Badge, Button, Card, Flex, Input, Modal, Skeleton } from '@dolanske/vui'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { usePasskeyBus } from '@/composables/usePasskeyBus'
import { useBreakpoint } from '@/lib/mediaQuery'
import { deletePasskey, isPasskeySupported, listPasskeys, registerPasskey, renamePasskey } from '@/lib/passkey'

const isBelowSmall = useBreakpoint('<s')
const supabase = useSupabaseClient()
const { dispatchPasskeysChanged } = usePasskeyBus()

const supported = ref(true)
const loading = ref(false)
const hasFetched = ref(false)
const enrolling = ref(false)
const passkeyError = ref('')
const passkeys = ref<EnrolledPasskey[]>([])

const renameState = reactive({
  open: false,
  passkeyId: '',
  name: '',
  saving: false,
  error: '',
})

const removeModalOpen = ref(false)
const removeLoading = ref(false)
const removeError = ref('')
const removeTarget = ref<EnrolledPasskey | null>(null)

const showSkeleton = computed(() => loading.value && !hasFetched.value)

async function loadPasskeys() {
  loading.value = true
  passkeyError.value = ''
  try {
    passkeys.value = await listPasskeys(supabase)
    dispatchPasskeysChanged({ count: passkeys.value.length })
  }
  catch (err) {
    passkeyError.value = err instanceof Error ? err.message : 'Failed to load passkeys.'
  }
  finally {
    loading.value = false
    hasFetched.value = true
  }
}

async function addPasskey() {
  if (enrolling.value)
    return

  enrolling.value = true
  passkeyError.value = ''

  try {
    const enrolled = await registerPasskey(supabase)
    passkeys.value = [...passkeys.value, enrolled]
    dispatchPasskeysChanged({ count: passkeys.value.length })
  }
  catch (err) {
    // A cancelled browser prompt surfaces as an abort/NotAllowed error - keep quiet for those.
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError'))
      return
    passkeyError.value = err instanceof Error ? err.message : 'Failed to register passkey.'
  }
  finally {
    enrolling.value = false
  }
}

function openRename(passkey: EnrolledPasskey) {
  renameState.open = true
  renameState.passkeyId = passkey.id
  renameState.name = passkey.friendly_name ?? ''
  renameState.error = ''
  renameState.saving = false
}

function cancelRename() {
  if (renameState.saving)
    return
  renameState.open = false
}

async function saveRename() {
  const name = renameState.name.trim()
  if (!name) {
    renameState.error = 'Enter a name.'
    return
  }

  renameState.saving = true
  renameState.error = ''
  try {
    const updated = await renamePasskey(supabase, renameState.passkeyId, name)
    passkeys.value = passkeys.value.map(p => (p.id === updated.id ? updated : p))
    renameState.open = false
  }
  catch (err) {
    renameState.error = err instanceof Error ? err.message : 'Failed to rename passkey.'
  }
  finally {
    renameState.saving = false
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
    await deletePasskey(supabase, removeTarget.value.id)
    passkeys.value = passkeys.value.filter(p => p.id !== removeTarget.value?.id)
    dispatchPasskeysChanged({ count: passkeys.value.length })
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
  return passkey.friendly_name?.trim() || 'Unnamed passkey'
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
  supported.value = isPasskeySupported()
  if (supported.value)
    void loadPasskeys()
  else
    hasFetched.value = true
})
</script>

<template>
  <Card separators class="card-bg">
    <template #header>
      <h4>Passkeys</h4>
    </template>

    <Flex column gap="l">
      <Alert v-if="!supported" variant="info">
        <p class="text-s">
          This browser doesn't support passkeys, so they can't be managed here.
        </p>
      </Alert>

      <template v-else>
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
                    <Badge size="s" :variant="passkeys.length > 0 ? 'success' : 'neutral'">
                      <Icon
                        name="ph:fingerprint"
                        :class="passkeys.length > 0 ? 'text-color-accent' : ''"
                      />
                      {{ passkeys.length > 0 ? `${passkeys.length} passkey${passkeys.length === 1 ? '' : 's'}` : 'None' }}
                    </Badge>
                  </Flex>
                  <p :class="`text-s text-color-lighter${isBelowSmall ? ' text-center' : ''}`">
                    Passwordless sign in with biometrics, a PIN, or a hardware key.
                  </p>
                </Flex>
              </Flex>
              <Button
                :expand="isBelowSmall"
                variant="accent"
                :loading="enrolling"
                @click="addPasskey"
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

                  <Flex gap="xs" y-center>
                    <Button
                      plain
                      size="s"
                      square
                      :disabled="removeLoading"
                      @click="openRename(passkey)"
                    >
                      <Icon name="ph:pencil-simple" />
                    </Button>
                    <Button
                      variant="danger"
                      plain
                      size="s"
                      square
                      :disabled="removeLoading"
                      @click="requestRemove(passkey)"
                    >
                      <Icon name="ph:trash" class="text-color-red" />
                    </Button>
                  </Flex>
                </Flex>
              </Flex>
            </Flex>
          </div>

          <Alert v-if="passkeyError" filled variant="danger">
            <p class="text-s">
              {{ passkeyError }}
            </p>
          </Alert>
          <Alert v-if="removeError" filled variant="danger" class="text-s">
            <p class="text-s">
              {{ removeError }}
            </p>
          </Alert>
        </template>
      </template>
    </Flex>
  </Card>

  <!-- Rename passkey -->
  <Modal
    :open="renameState.open"
    size="s"
    :card="{ separators: true }"
    :can-dismiss="!renameState.saving"
    @close="cancelRename"
  >
    <template #header>
      <Flex column gap="xxs">
        <h4>Rename passkey</h4>
        <p class="text-m text-color-light">
          Give your passkey a name so you can identify it later.
        </p>
      </Flex>
    </template>

    <Alert v-if="renameState.error" filled variant="danger" class="mb-m">
      <p class="text-s">
        {{ renameState.error }}
      </p>
    </Alert>

    <Input
      v-model="renameState.name"
      expand
      name="passkey-name"
      label="Passkey name"
      placeholder="Work laptop"
      :maxlength="120"
    />

    <template #footer>
      <Flex gap="s" :column="isBelowSmall" :row="!isBelowSmall" expand y-center>
        <Button expand variant="accent" :loading="renameState.saving" @click="saveRename">
          Save
        </Button>
        <Button expand :disabled="renameState.saving" @click="cancelRename">
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
  border-radius: var(--border-radius-pill);
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
</style>
