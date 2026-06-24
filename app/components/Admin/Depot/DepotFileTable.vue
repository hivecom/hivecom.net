<script setup lang="ts">
import type { Ref } from 'vue'
import type { DepotAdminFile } from '@/composables/useDepot'

import { Alert, Badge, Button, Card, CopyClipboard, Flex, Grid, Input, paginate, Pagination, pushToast, Spinner, Table, Tooltip } from '@dolanske/vui'
import { watchDebounced } from '@vueuse/core'
import { computed, inject, onBeforeMount, ref } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import CopyValue from '@/components/Shared/CopyValue.vue'
import ElapsedTimeIndicator from '@/components/Shared/ElapsedTimeIndicator.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import { useAdminPermissions } from '@/composables/useAdminPermissions'
import { useDepot } from '@/composables/useDepot'
import { formatBytes } from '@/lib/storageAssets'

type SortCol = 'uploaded_at' | 'file_size'

// Bumped on delete so the page's KPI cards refetch.
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const { adminListFiles, deleteFile } = useDepot()
const { canModerateDepot } = useAdminPermissions()

const viewMode = ref<'table' | 'grid'>('grid')

function isImage(file: DepotAdminFile): boolean {
  return file.content_type.startsWith('image/')
}

// Page size is provided by the admin layout, same as the other admin tables.
const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))

// ─── State ──────────────────────────────────────────────────────────────────

const loading = ref(false)
const initialLoad = ref(true)
const errorMessage = ref('')
const files = ref<DepotAdminFile[]>([])
const total = ref(0)

const page = ref(1)
const sortCol = ref<SortCol>('uploaded_at')
const sortDir = ref<'asc' | 'desc'>('desc')
const search = ref('')
const contentType = ref('')

// ─── Fetch ──────────────────────────────────────────────────────────────────

async function fetchFiles() {
  loading.value = true
  errorMessage.value = ''
  try {
    const { files: rows, total: count } = await adminListFiles({
      limit: adminTablePerPage.value,
      offset: (page.value - 1) * adminTablePerPage.value,
      sort: sortCol.value,
      order: sortDir.value,
      q: search.value || undefined,
      contentType: contentType.value || undefined,
    })
    files.value = rows
    total.value = count
  }
  catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Could not load uploads'
    files.value = []
    total.value = 0
  }
  finally {
    loading.value = false
    initialLoad.value = false
  }
}

onBeforeMount(fetchFiles)

// A content-type change or a new search resets to the first page; both refetch.
watchDebounced([search, contentType], () => {
  page.value = 1
  void fetchFiles()
}, { debounce: 300 })

// ─── Pagination ───────────────────────────────────────────────────────────────

const paginationState = computed(() => paginate(total.value, page.value, adminTablePerPage.value))
const shouldShowPagination = computed(() => total.value > adminTablePerPage.value)

function setPage(p: number) {
  page.value = p
  void fetchFiles()
}

// ─── Sorting ────────────────────────────────────────────────────────────────

function handleSort(col: SortCol) {
  if (sortCol.value === col) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  }
  else {
    sortCol.value = col
    sortDir.value = 'desc'
  }
  page.value = 1
  void fetchFiles()
}

function sortIcon(col: SortCol): string {
  if (sortCol.value !== col)
    return 'ph:arrows-down-up'
  return sortDir.value === 'asc' ? 'ph:arrow-up' : 'ph:arrow-down'
}

// ─── Delete (moderation) ──────────────────────────────────────────────────────

const fileToDelete = ref<DepotAdminFile | null>(null)
const deleting = ref(false)
const showDeleteModal = computed({
  get: () => fileToDelete.value !== null,
  set: (open: boolean) => {
    if (!open)
      fileToDelete.value = null
  },
})

async function confirmDelete() {
  const target = fileToDelete.value
  if (!target)
    return
  deleting.value = true
  try {
    await deleteFile(target.object_key)
    pushToast('Upload deleted')
    fileToDelete.value = null
    // Stepping back a page when the last row on a non-first page is removed
    // avoids landing on an empty page.
    if (files.value.length === 1 && page.value > 1)
      page.value -= 1
    await fetchFiles()
    refreshSignal.value++
  }
  catch (err) {
    pushToast(err instanceof Error ? err.message : 'Could not delete upload')
  }
  finally {
    deleting.value = false
  }
}

// Anonymous uploads land under the reserved _anonymous owner with no subject.
function uploaderLabel(file: DepotAdminFile): string {
  return file.uploader_account === '_anonymous' || file.uploader_account === ''
    ? 'anonymous'
    : file.uploader_account
}
</script>

<template>
  <Flex column gap="s" expand>
    <!-- Filters + count -->
    <Flex x-between y-center gap="s" wrap expand>
      <Flex gap="s" y-center wrap>
        <Input v-model="search" placeholder="Search filename">
          <template #start>
            <Icon name="ph:magnifying-glass" />
          </template>
        </Input>
        <Input v-model="contentType" placeholder="Content type, e.g. image/png" />
      </Flex>
      <Flex gap="s" y-center>
        <Spinner v-if="loading && !initialLoad" size="s" />
        <span class="text-color-lighter text-s" style="text-wrap: nowrap;">Total {{ total }}</span>
        <Flex gap="xs" y-center>
          <Tooltip>
            <Button :variant="viewMode === 'table' ? 'accent' : 'gray'" size="s" square @click="viewMode = 'table'">
              <Icon name="ph:list" />
            </Button>
            <template #tooltip>
              <p>Table</p>
            </template>
          </Tooltip>
          <Tooltip>
            <Button :variant="viewMode === 'grid' ? 'accent' : 'gray'" size="s" square @click="viewMode = 'grid'">
              <Icon name="ph:grid-four" />
            </Button>
            <template #tooltip>
              <p>Grid</p>
            </template>
          </Tooltip>
        </Flex>
      </Flex>
    </Flex>

    <Alert v-if="errorMessage" variant="danger">
      {{ errorMessage }}
    </Alert>

    <Flex v-if="initialLoad" x-center y-center expand style="min-height: 160px;">
      <Spinner />
    </Flex>

    <Alert v-else-if="files.length === 0" variant="info">
      No uploads found
    </Alert>

    <TableContainer v-else-if="viewMode === 'table'">
      <Table.Root separate-cells>
        <template #header>
          <Table.Head>File</Table.Head>
          <Table.Head>Type</Table.Head>
          <Table.Head class="sortable-head" @click="handleSort('file_size')">
            <Flex gap="xs" y-center>
              Size
              <Icon :name="sortIcon('file_size')" size="14" class="sort-icon" />
            </Flex>
          </Table.Head>
          <Table.Head>Uploader</Table.Head>
          <Table.Head class="sortable-head" @click="handleSort('uploaded_at')">
            <Flex gap="xs" y-center>
              Uploaded
              <Icon :name="sortIcon('uploaded_at')" size="14" class="sort-icon" />
            </Flex>
          </Table.Head>
          <Table.Head>URL</Table.Head>
          <Table.Head v-if="canModerateDepot" />
        </template>

        <template #body>
          <tr v-for="file in files" :key="file.object_key">
            <Table.Cell>{{ file.original_filename }}</Table.Cell>
            <Table.Cell>
              <Badge v-if="file.content_type" variant="neutral">
                {{ file.content_type }}
              </Badge>
              <span v-else class="text-color-lightest text-s">unknown</span>
            </Table.Cell>
            <Table.Cell>{{ formatBytes(file.size) }}</Table.Cell>
            <Table.Cell>
              <span :class="{ 'text-color-lightest': uploaderLabel(file) === 'anonymous' }">
                {{ uploaderLabel(file) }}
              </span>
            </Table.Cell>
            <Table.Cell>
              <ElapsedTimeIndicator :date="file.uploaded_at" :active-label="null" />
            </Table.Cell>
            <Table.Cell>
              <CopyValue :text="file.url" link wrap />
            </Table.Cell>
            <Table.Cell v-if="canModerateDepot" @click.stop>
              <Button
                variant="danger"
                size="s"
                square
                @click="fileToDelete = file"
              >
                <Icon name="ph:trash" />
              </Button>
            </Table.Cell>
          </tr>
        </template>

        <template v-if="shouldShowPagination" #pagination>
          <Pagination :pagination="paginationState" @change="setPage" />
        </template>
      </Table.Root>
    </TableContainer>

    <template v-else>
      <Grid expand gap="s" class="depot-grid">
        <Card
          v-for="file in files"
          :key="file.object_key"
          :padding="false"
          class="depot-grid-card"
        >
          <div class="depot-grid-preview">
            <img
              v-if="isImage(file)"
              :src="file.url"
              :alt="file.original_filename"
              loading="lazy"
            >
            <Icon v-else name="ph:file" size="32" />

            <div class="depot-grid-actions" @click.stop>
              <CopyClipboard :text="file.url" confirm>
                <Tooltip>
                  <Button size="s" variant="gray" square>
                    <Icon name="ph:link-simple" />
                  </Button>
                  <template #tooltip>
                    <p>Copy URL</p>
                  </template>
                </Tooltip>
              </CopyClipboard>
              <Tooltip v-if="canModerateDepot">
                <Button size="s" variant="danger" square @click="fileToDelete = file">
                  <Icon name="ph:trash" />
                </Button>
                <template #tooltip>
                  <p>Delete</p>
                </template>
              </Tooltip>
            </div>
          </div>

          <Flex column :gap="0" class="depot-grid-meta">
            <span class="depot-grid-name" :title="file.original_filename">{{ file.original_filename }}</span>
            <span class="text-color-lighter text-s">
              {{ formatBytes(file.size) }}, {{ uploaderLabel(file) }}
            </span>
          </Flex>
        </Card>
      </Grid>

      <Flex v-if="shouldShowPagination" x-center expand>
        <Pagination :pagination="paginationState" @change="setPage" />
      </Flex>
    </template>

    <ConfirmModal
      v-model:open="showDeleteModal"
      title="Delete upload"
      :description="fileToDelete ? `Permanently delete ${fileToDelete.original_filename}? This removes it for everyone and cannot be undone.` : ''"
      confirm-text="Delete"
      :confirm-loading="deleting"
      destructive
      @confirm="confirmDelete"
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

.depot-grid {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

.depot-grid-preview {
  position: relative;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--color-bg-lowered);
  color: var(--color-text-lighter);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.depot-grid-actions {
  position: absolute;
  top: var(--space-xs);
  right: var(--space-xs);
  display: flex;
  gap: var(--space-xs);
  opacity: 0;
  transition: opacity var(--transition);
}

.depot-grid-card:hover .depot-grid-actions,
.depot-grid-card:focus-within .depot-grid-actions {
  opacity: 1;
}

.depot-grid-meta {
  padding: var(--space-s);
}

.depot-grid-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
