<script setup lang="ts">
import type { Ref } from 'vue'
import type { DepotUploader, UploaderSort } from '@/composables/useDepot'

import { Alert, Button, defineTable, Flex, paginate, Pagination, pushToast, Table, Tooltip } from '@dolanske/vui'
import { computed, inject, onBeforeMount, ref, watch } from 'vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { useAdminPermissions } from '@/composables/useAdminPermissions'
import { useDepot } from '@/composables/useDepot'
import { formatBytes } from '@/lib/storageAssets'

// Refetch when a delete elsewhere on the page changes the totals.
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const { adminListUploaders, adminWipeUserFiles } = useDepot()
const { canModerateDepot } = useAdminPermissions()
const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))

const loading = ref(false)
const initialLoad = ref(true)
const errorMessage = ref('')
const users = ref<DepotUploader[]>([])
const total = ref(0)
const page = ref(1)
const sortCol = ref<UploaderSort>('file_size')
const sortDir = ref<'asc' | 'desc'>('desc')

// Table.Root needs a defineTable context to render. Uploaders sort and paginate
// server-side, so this runs for the context alone (no selection, no client paging).
const tableData = computed(() => users.value.map(u => ({
  id: `${u.issuer}/${u.account}`,
  _original: u,
})))

const { rows: tableRows } = defineTable(tableData, { pagination: { enabled: false } })

async function fetchUploaders() {
  loading.value = true
  errorMessage.value = ''
  try {
    const { users: rows, total: count } = await adminListUploaders({
      limit: adminTablePerPage.value,
      offset: (page.value - 1) * adminTablePerPage.value,
      sort: sortCol.value,
      order: sortDir.value,
    })
    users.value = rows
    total.value = count
  }
  catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Could not load uploaders'
    users.value = []
    total.value = 0
  }
  finally {
    loading.value = false
    initialLoad.value = false
  }
}

onBeforeMount(fetchUploaders)
watch(() => refreshSignal.value, fetchUploaders)

const paginationState = computed(() => paginate(total.value, page.value, adminTablePerPage.value))
const shouldShowPagination = computed(() => total.value > adminTablePerPage.value)

function setPage(p: number) {
  page.value = p
  void fetchUploaders()
}

function handleSort(col: UploaderSort) {
  if (sortCol.value === col)
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else
    sortCol.value = col

  page.value = 1
  void fetchUploaders()
}

function sortIcon(col: UploaderSort): string {
  if (sortCol.value !== col)
    return 'ph:arrows-down-up'
  return sortDir.value === 'asc' ? 'ph:arrow-up' : 'ph:arrow-down'
}

// Anonymous uploads aggregate under the reserved _anonymous owner; no profile.
function isAnonymous(account: string): boolean {
  return account === '_anonymous' || account === ''
}

// ─── Wipe a user's uploads ────────────────────────────────────────────────────

const userToWipe = ref<DepotUploader | null>(null)
const wiping = ref(false)
const showWipeModal = computed({
  get: () => userToWipe.value !== null,
  set: (open: boolean) => {
    if (!open)
      userToWipe.value = null
  },
})

// Wipes every upload owned by the selected uploader, then refetches so the row
// drops out and the page KPIs update. Anonymous rows carry no issuer, so pass it
// only when present to scope the wipe to the one tenant.
async function confirmWipe() {
  const target = userToWipe.value
  if (!target)
    return
  wiping.value = true
  try {
    const { deleted } = await adminWipeUserFiles(target.account, target.issuer || undefined)
    pushToast(`Wiped ${deleted} upload${deleted === 1 ? '' : 's'}`)
    userToWipe.value = null
    if (users.value.length === 1 && page.value > 1)
      page.value -= 1
    await fetchUploaders()
    refreshSignal.value++
  }
  catch (err) {
    pushToast(err instanceof Error ? err.message : 'Could not wipe uploads')
  }
  finally {
    wiping.value = false
  }
}
</script>

<template>
  <Flex column gap="s" expand>
    <Alert v-if="errorMessage" variant="danger">
      {{ errorMessage }}
    </Alert>

    <TableSkeleton v-if="initialLoad" :columns="3" :rows="6" :show-actions="false" />

    <Alert v-else-if="users.length === 0" variant="info">
      No uploaders found
    </Alert>

    <TableContainer v-else>
      <Table.Root separate-cells>
        <template #header>
          <Table.Head>User</Table.Head>
          <Table.Head class="sortable-head" @click="handleSort('file_count')">
            <Flex gap="xs" y-center>
              Uploads
              <Icon :name="sortIcon('file_count')" size="14" class="sort-icon" />
            </Flex>
          </Table.Head>
          <Table.Head class="sortable-head" @click="handleSort('file_size')">
            <Flex gap="xs" y-center>
              Storage
              <Icon :name="sortIcon('file_size')" size="14" class="sort-icon" />
            </Flex>
          </Table.Head>
          <Table.Head v-if="canModerateDepot">
            Actions
          </Table.Head>
        </template>

        <template #body>
          <tr v-for="row in tableRows" :key="row.id">
            <Table.Cell>
              <span v-if="isAnonymous(row._original.account)" class="text-color-lightest">anonymous</span>
              <UserLink v-else :user-id="row._original.account" show-avatar />
            </Table.Cell>
            <Table.Cell>{{ row._original.files }}</Table.Cell>
            <Table.Cell>{{ formatBytes(row._original.bytes) }}</Table.Cell>
            <Table.Cell v-if="canModerateDepot" @click.stop>
              <Tooltip>
                <Button
                  variant="danger"
                  size="s"
                  square
                  @click="userToWipe = row._original"
                >
                  <Icon name="ph:trash" />
                </Button>
                <template #tooltip>
                  <p>Wipe all uploads</p>
                </template>
              </Tooltip>
            </Table.Cell>
          </tr>
        </template>

        <template v-if="shouldShowPagination" #pagination>
          <Pagination :pagination="paginationState" @change="setPage" />
        </template>
      </Table.Root>
    </TableContainer>

    <ConfirmModal
      v-model:open="showWipeModal"
      title="Wipe user uploads"
      :description="userToWipe ? `Permanently delete all ${userToWipe.files} upload${userToWipe.files === 1 ? '' : 's'} (${formatBytes(userToWipe.bytes)}) from this user? Their public links will stop working and this cannot be undone.` : ''"
      confirm-text="Wipe all"
      cancel-text="Cancel"
      :confirm-loading="wiping"
      destructive
      @confirm="confirmWipe"
    />
  </Flex>
</template>

<style scoped lang="scss">
.sortable-head {
  cursor: pointer;
  user-select: none;

  &:hover {
    color: var(--color-text);
  }
}

.sort-icon {
  color: var(--color-text-lighter);
  flex-shrink: 0;
}
</style>
