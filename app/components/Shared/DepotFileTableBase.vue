<script setup lang="ts" generic="T extends DepotFile">
import type { VNode, WatchSource } from 'vue'
import type { AdminListFilesOptions, DepotFile, DepotFilePage } from '@/composables/useDepot'
import { Alert, Badge, Button, CopyClipboard, DropdownItem, Flex, Grid, Input, Pagination, Skeleton, Spinner, Table, Tooltip } from '@dolanske/vui'
import { computed } from 'vue'
import AssetDetails from '@/components/Admin/Assets/AssetDetails.vue'
import AssetGrid from '@/components/Admin/Assets/AssetGrid.vue'
import FileViewToggle from '@/components/Admin/Shared/FileViewToggle.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import ElapsedTimeIndicator from '@/components/Shared/ElapsedTimeIndicator.vue'
import SelectedRowsActions from '@/components/Shared/SelectedRowsActions.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import { useDepotFileTable } from '@/composables/useDepotFileTable'
import { formatBytes } from '@/lib/storageAssets'

const props = defineProps<{
  // The listing call (self listFiles or admin adminListFiles) and the delete.
  listFiles: (opts: AdminListFilesOptions) => Promise<DepotFilePage<T>>
  deleteFile: (objectKey: string) => Promise<void>
  perPage: number
  // Gates the select column, row/bulk delete, grid + drawer delete. The Sharing
  // table is always on (your own files); the admin table gates on moderation.
  canManage: boolean
  // Hide the uploader on the grid tiles. The Sharing page only shows the
  // logged-in user's own files, so there's nothing to attribute.
  hideUploader?: boolean
  emptyMessage: string
  emptySearchMessage?: string
  // Gap between the filter controls in the toolbar. The admin filters sit at 's';
  // the self table packs its upload/rules/search tighter at 'xs'.
  filtersGap?: 'xs' | 's'
  // The admin table renders the content type as a Badge; the self table plain.
  contentTypeBadge?: boolean
  // Trailing clause of the delete confirmations (after "Permanently delete X?").
  deleteConsequenceSingular?: string
  deleteConsequencePlural?: string
  loadErrorMessage?: string
  // Extra listing params and the reactive sources that trigger a refetch (admin
  // content-type and owner filters).
  extraParams?: () => Partial<AdminListFilesOptions>
  extraWatchSources?: WatchSource[]
}>()

defineSlots<{
  'filters-before': () => VNode[]
  'filters-after': () => VNode[]
  'toolbar-actions': () => VNode[]
  'extra-head': () => VNode[]
  'extra-cell': (props: { file: T, openDetails: (file: T) => void }) => VNode[]
  'drawer-overview': (props: { file: T | null }) => VNode[]
}>()

// Bumped after a mutation so the page's KPI/quota cards refetch.
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })
// Surfaced so the self page can show the upload count; internal for admin.
const total = defineModel<number>('total', { default: 0 })
// The admin table persists this in user settings; the self table keeps it local.
const viewMode = defineModel<'table' | 'grid'>('viewMode', { default: 'grid' })

const perPage = computed(() => props.perPage)

const {
  loading,
  initialLoad,
  errorMessage,
  files,
  gridAssets,
  tableRows,
  selectedRows,
  deselectAllRows,
  search,
  fetchFiles,
  paginationState,
  shouldShowPagination,
  setPage,
  handleSort,
  sortIcon,
  selectedAsset,
  selectedFile,
  showDetailsDrawer,
  openDetails,
  handleAssetClick,
  fileToDelete,
  deleting,
  showDeleteModal,
  confirmDelete,
  handleAssetDelete,
  showBulkDeleteModal,
  bulkDeleting,
  handleBulkDelete,
  handleUploaded,
  handleExternalWipe,
} = useDepotFileTable<T>({
  listFiles: props.listFiles,
  deleteFile: props.deleteFile,
  perPage,
  refreshSignal,
  total,
  extraParams: props.extraParams,
  extraWatchSources: props.extraWatchSources,
  loadErrorMessage: props.loadErrorMessage,
})

// Surfaced for components that own external mutations (the Sharing table's
// upload and wipe-all), which call these to resync after the action.
defineExpose({ refresh: fetchFiles, handleUploaded, handleExternalWipe })
</script>

<template>
  <Flex column gap="s" expand>
    <!-- Toolbar: filters + count + view toggle -->
    <Flex x-between y-center gap="s" wrap expand>
      <Flex :gap="filtersGap ?? 's'" y-center wrap>
        <slot name="filters-before" />
        <Input v-model="search" placeholder="Search filename">
          <template #start>
            <Icon name="ph:magnifying-glass" />
          </template>
        </Input>
        <slot name="filters-after" />
      </Flex>
      <Flex gap="s" y-center>
        <Spinner v-if="loading && !initialLoad" size="s" />
        <span class="text-color-lighter text-s" style="text-wrap: nowrap;">Total {{ total }}</span>
        <slot name="toolbar-actions" />
        <FileViewToggle v-model="viewMode" />
      </Flex>
    </Flex>

    <Alert v-if="errorMessage" variant="danger">
      {{ errorMessage }}
    </Alert>

    <TableSkeleton
      v-if="initialLoad && viewMode === 'table'"
      :columns="$slots['extra-head'] ? 5 : 4"
      :rows="6"
      :show-actions="canManage"
    />
    <Grid
      v-else-if="initialLoad && viewMode === 'grid'"
      expand
      gap="s"
      columns="repeat(auto-fill, minmax(200px, 1fr))"
    >
      <Skeleton v-for="i in perPage" :key="i" :height="207" :radius="8" />
    </Grid>

    <Alert v-else-if="files.length === 0" variant="info">
      {{ search ? (emptySearchMessage ?? 'No uploads match your search') : emptyMessage }}
    </Alert>

    <TableContainer v-else-if="viewMode === 'table'">
      <Table.Root separate-cells>
        <template #header>
          <th v-if="canManage" class="vui-table-interactive-cell" />
          <Table.Head>File</Table.Head>
          <Table.Head>Type</Table.Head>
          <Table.Head class="sortable-head" @click="handleSort('file_size')">
            <Flex gap="xs" y-center>
              Size
              <Icon :name="sortIcon('file_size')" size="14" class="sort-icon" />
            </Flex>
          </Table.Head>
          <slot name="extra-head" />
          <Table.Head class="sortable-head" @click="handleSort('uploaded_at')">
            <Flex gap="xs" y-center>
              Uploaded
              <Icon :name="sortIcon('uploaded_at')" size="14" class="sort-icon" />
            </Flex>
          </Table.Head>
          <Table.Head v-if="canManage">
            Actions
          </Table.Head>
        </template>

        <template #body>
          <tr v-for="row in tableRows" :key="row._original.object_key" class="depot-row">
            <Table.SelectRow v-if="canManage" :row="row" />
            <Table.Cell @click="openDetails(row._original)">
              <Flex gap="xs" y-center>
                <NuxtLink
                  :to="row._original.url"
                  target="_blank"
                  rel="noopener"
                  class="text-s depot-file-link"
                  @click.stop
                >
                  {{ row._original.original_filename }}
                </NuxtLink>
                <span @click.stop>
                  <CopyClipboard :text="row._original.url" confirm>
                    <Tooltip>
                      <Button size="s" variant="gray" plain square>
                        <Icon name="ph:copy" />
                      </Button>
                      <template #tooltip>
                        <p>Copy URL</p>
                      </template>
                    </Tooltip>
                  </CopyClipboard>
                </span>
              </Flex>
            </Table.Cell>
            <Table.Cell @click="openDetails(row._original)">
              <template v-if="row._original.content_type">
                <Badge v-if="contentTypeBadge" variant="neutral">
                  {{ row._original.content_type }}
                </Badge>
                <span v-else class="text-s">{{ row._original.content_type }}</span>
              </template>
              <span v-else class="text-color-lightest text-s">unknown</span>
            </Table.Cell>
            <Table.Cell @click="openDetails(row._original)">
              {{ formatBytes(row._original.size) }}
            </Table.Cell>
            <slot name="extra-cell" :file="row._original" :open-details="openDetails" />
            <Table.Cell @click="openDetails(row._original)">
              <ElapsedTimeIndicator :date="row._original.uploaded_at" :active-label="null" />
            </Table.Cell>
            <Table.Cell v-if="canManage" @click.stop>
              <Tooltip>
                <Button
                  variant="danger"
                  size="s"
                  square
                  @click="fileToDelete = row._original"
                >
                  <Icon name="ph:trash" />
                </Button>
                <template #tooltip>
                  <p>Delete</p>
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

    <template v-else>
      <AssetGrid
        :assets="gridAssets"
        :can-delete="canManage"
        :hide-uploader="hideUploader"
        @click-asset="handleAssetClick"
        @delete-asset="handleAssetDelete"
      />

      <Flex v-if="shouldShowPagination" x-center expand>
        <Pagination :pagination="paginationState" @change="setPage" />
      </Flex>
    </template>

    <SelectedRowsActions
      v-if="canManage && viewMode === 'table'"
      :selected-count="selectedRows.length"
      @clear="deselectAllRows()"
    >
      <DropdownItem :disabled="bulkDeleting" @click="showBulkDeleteModal = true">
        <template #icon>
          <Icon name="ph:trash" class="text-color-red" />
        </template>
        Delete
        <template #hint>
          {{ selectedRows.length }}
        </template>
      </DropdownItem>
    </SelectedRowsActions>

    <AssetDetails
      v-model:is-open="showDetailsDrawer"
      :asset="selectedAsset"
      :can-delete="canManage"
      :can-rename="false"
      @delete="handleAssetDelete"
    >
      <template v-if="$slots['drawer-overview']" #overview>
        <slot name="drawer-overview" :file="selectedFile" />
      </template>
    </AssetDetails>

    <ConfirmModal
      v-model:open="showDeleteModal"
      title="Delete upload"
      :description="fileToDelete ? `Permanently delete ${fileToDelete.original_filename}? ${deleteConsequenceSingular ?? 'This cannot be undone.'}` : ''"
      confirm-text="Delete"
      :confirm-loading="deleting"
      destructive
      @confirm="confirmDelete"
    />

    <ConfirmModal
      v-model:open="showBulkDeleteModal"
      :title="`Delete ${selectedRows.length} uploads`"
      :description="`Permanently delete ${selectedRows.length} selected uploads? ${deleteConsequencePlural ?? 'This cannot be undone.'}`"
      confirm-text="Delete"
      cancel-text="Cancel"
      :confirm-loading="bulkDeleting"
      destructive
      @confirm="handleBulkDelete"
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

.depot-row {
  cursor: pointer;

  &:hover td {
    background-color: var(--color-bg-raised);
  }
}

.depot-file-link {
  color: var(--color-text);

  &:hover {
    text-decoration: underline;
  }
}
</style>
