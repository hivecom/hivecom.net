<script setup lang="ts">
import type { SuppressionEntry } from '@/composables/useEmailAdmin'
import { Alert, Badge, Button, defineTable, Flex, pushToast, Table, Tooltip } from '@dolanske/vui'
import { computed, onBeforeMount, ref } from 'vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { useAdminPermissions } from '@/composables/useAdminPermissions'
import { useEmailAdmin } from '@/composables/useEmailAdmin'
import { fullDateTime } from '@/lib/utils/date'

const PAGE_SIZE = 50

const { fetchSuppressionPage, removeSuppression } = useEmailAdmin()
const { canSendBroadcasts } = useAdminPermissions()

// SES pages this list with a forward-only token, so rows accumulate instead of
// swapping out under numbered pages.
const entries = ref<SuppressionEntry[]>([])
const nextToken = ref<string | null>(null)
const loading = ref(true)
const loadingMore = ref(false)
const errorMessage = ref('')

const pendingRemoval = ref<SuppressionEntry | null>(null)
const removeConfirmOpen = ref(false)
const removing = ref('')

const hasMore = computed(() => nextToken.value !== null)

// Table.Root and TableSkeleton inject the select-row context that only
// defineTable provides, so this call is load-bearing even with pagination and
// selection off - SES's forward-only token drives loading instead.
const { rows } = defineTable(entries)

async function loadFirstPage() {
  loading.value = true
  errorMessage.value = ''
  try {
    const page = await fetchSuppressionPage(PAGE_SIZE)
    entries.value = page.entries
    nextToken.value = page.nextToken
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load the suppression list'
  }
  finally {
    loading.value = false
  }
}

async function loadMore() {
  if (nextToken.value === null || loadingMore.value)
    return

  loadingMore.value = true
  errorMessage.value = ''
  try {
    const page = await fetchSuppressionPage(PAGE_SIZE, nextToken.value)
    // The first page unions in profile-flagged addresses that SES may still
    // list on a later page, so drop anything we already have.
    const known = new Set(entries.value.map(row => row.email))
    entries.value = [...entries.value, ...page.entries.filter(row => !known.has(row.email))]
    nextToken.value = page.nextToken
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load more addresses'
  }
  finally {
    loadingMore.value = false
  }
}

onBeforeMount(loadFirstPage)

function reasonVariant(reason: string | null) {
  if (reason === 'COMPLAINT')
    return 'danger'
  if (reason === 'BOUNCE')
    return 'warning'
  return 'neutral'
}

// SES is suppressing the address but our profile never got flagged, so the two
// sides disagree about whether this person is deliverable. The mirror case,
// flagged but not in SES, is a first-class row now and gets its own badge in
// the reason column instead.
function hasDrift(entry: SuppressionEntry): boolean {
  return entry.sesSuppressed && entry.user !== null && !entry.user.bouncedFlag
}

function promptRemove(entry: SuppressionEntry) {
  pendingRemoval.value = entry
  removeConfirmOpen.value = true
}

function cancelRemove() {
  removeConfirmOpen.value = false
  pendingRemoval.value = null
}

async function confirmRemove() {
  const entry = pendingRemoval.value
  if (!entry)
    return

  removing.value = entry.email
  try {
    await removeSuppression(entry.email)
    entries.value = entries.value.filter(row => row.email !== entry.email)
    pushToast('Address un-suppressed', { description: entry.email })
  }
  catch (error: unknown) {
    pushToast('Could not remove the suppression', {
      description: error instanceof Error ? error.message : 'Unknown error',
    })
  }
  finally {
    removing.value = ''
    removeConfirmOpen.value = false
    pendingRemoval.value = null
  }
}
</script>

<template>
  <Flex column gap="m" expand>
    <Alert v-if="errorMessage" variant="danger">
      {{ errorMessage }}
    </Alert>

    <TableSkeleton v-if="loading" :columns="5" :rows="8" :show-actions="canSendBroadcasts" />

    <template v-else>
      <TableContainer>
        <Table.Root v-if="entries.length > 0" separate-cells class="mb-l">
          <template #header>
            <Table.Head>Email</Table.Head>
            <Table.Head>Reason</Table.Head>
            <Table.Head>Last update</Table.Head>
            <Table.Head>Linked user</Table.Head>
            <Table.Head>Flags</Table.Head>
            <Table.Head v-if="canSendBroadcasts">
              Actions
            </Table.Head>
          </template>

          <template #body>
            <tr v-for="entry in rows" :key="entry.email">
              <Table.Cell>{{ entry.email }}</Table.Cell>

              <Table.Cell>
                <Badge v-if="entry.sesSuppressed" :variant="reasonVariant(entry.reason)">
                  {{ entry.reason ?? 'Unknown' }}
                </Badge>
                <Tooltip v-else>
                  <Badge variant="warning">
                    PROFILE FLAG
                  </Badge>
                  <template #tooltip>
                    <p>Flagged on the profile (usually a delivery delay) but not suppressed in SES</p>
                  </template>
                </Tooltip>
              </Table.Cell>

              <Table.Cell>{{ fullDateTime(entry.lastUpdate) }}</Table.Cell>

              <Table.Cell>
                <UserLink
                  v-if="entry.user"
                  :user-id="entry.user.id"
                  show-avatar
                  class="text-s"
                />
                <span v-else class="text-color-light text-s">-</span>
              </Table.Cell>

              <Table.Cell>
                <Badge v-if="hasDrift(entry)" variant="warning">
                  flag drift
                </Badge>
                <span v-else class="text-color-light text-s">-</span>
              </Table.Cell>

              <Table.Cell v-if="canSendBroadcasts">
                <Flex gap="xs">
                  <Tooltip>
                    <Button
                      size="s"
                      variant="danger"
                      square
                      :loading="removing === entry.email"
                      @click="promptRemove(entry)"
                    >
                      <Icon name="ph:trash" />
                    </Button>
                    <template #tooltip>
                      <p>Remove from the suppression list</p>
                    </template>
                  </Tooltip>
                </Flex>
              </Table.Cell>
            </tr>
          </template>
        </Table.Root>

        <Alert v-else variant="info">
          No suppressed addresses. Nothing is bouncing or complaining right now.
        </Alert>
      </TableContainer>

      <Flex v-if="hasMore" x-center expand>
        <Button variant="gray" :loading="loadingMore" @click="loadMore">
          <template #start>
            <Icon name="ph:arrow-down" />
          </template>
          Load more
        </Button>
      </Flex>
    </template>

    <ConfirmModal
      v-model:open="removeConfirmOpen"
      title="Remove suppression"
      :description="`This un-suppresses ${pendingRemoval?.email ?? ''} in SES and clears the bounce flag on the matching profile, so mail starts going out again.`"
      confirm-text="Remove"
      :confirm-loading="removing.length > 0"
      destructive
      @confirm="confirmRemove"
      @cancel="cancelRemove"
    />
  </Flex>
</template>
