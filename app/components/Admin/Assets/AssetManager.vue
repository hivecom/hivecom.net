<script setup lang="ts">
import type { Ref } from 'vue'
import type { StorageAsset as CmsAsset, FlatSortColumn, StorageBucketId } from '@/lib/storageAssets'
import { Alert, Badge, BreadcrumbItem, Breadcrumbs, Button, ButtonGroup, CopyClipboard, defineTable, DropdownItem, Flex, Grid, Input, paginate, Pagination, pushToast, Skeleton, Spinner, Table, Tooltip } from '@dolanske/vui'
import { watchDebounced } from '@vueuse/core'
import { computed, inject, onBeforeMount, ref, watch } from 'vue'
import AssetDetails from '@/components/Admin/Assets/AssetDetails.vue'
import AssetGrid from '@/components/Admin/Assets/AssetGrid.vue'
import AssetRenameModal from '@/components/Admin/Assets/AssetRenameModal.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import ExpandableSelect from '@/components/Shared/ExpandableSelect.vue'
import SelectedRowsActions from '@/components/Shared/SelectedRowsActions.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import { CMS_BUCKET_ID, formatBytes, FORUMS_BUCKET_ID, isImageAsset, listStorageDirectory as listCmsDirectory, listStorageFilesRecursive as listCmsFilesRecursive, listStorageObjectsFlat, normalizePrefix, zipAndDownloadAssets } from '@/lib/storageAssets'
import { fullDateTime } from '@/lib/utils/date'
import { truncate } from '@/lib/utils/formatting'

interface Props {
  bucketId?: StorageBucketId
}

interface SelectOption<T extends string = string> {
  label: string
  value: T
}

type TypeFilterValue = 'all' | 'images' | 'documents' | 'other'
type SortOptionValue = 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc' | 'newest' | 'oldest'
type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'accent'

const props = defineProps<Props>()

const { canDeleteAssets } = useAdminPermissions()
const canDelete = computed(() => canDeleteAssets.value)

const supabase = useSupabaseClient()
const resolvedBucketId = computed(() => props.bucketId ?? CMS_BUCKET_ID)
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const loading = ref(true)
const reloading = ref(false)
const errorMessage = ref('')
const assets = ref<CmsAsset[]>([])
const currentPrefix = defineModel<string>('currentPrefix', { default: '' })
const searchQuery = ref('')
const typeFilter = ref<TypeFilterValue>('all')
const sortOption = ref<SortOptionValue>('name-asc')
const viewMode = defineModel<'table' | 'grid'>('viewMode', { default: 'table' })
const flatView = defineModel<boolean>('flatView', { default: false })
const downloadLoading = ref(false)

const isBelowMedium = useBreakpoint('<m')
type AssetActionKey = 'delete' | 'rename'

const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))

// ─── Flat view pagination & sort ──────────────────────────────────────────────
const PAGE_SIZE = computed(() => adminTablePerPage.value > 10 ? 50 : 25)
const page = defineModel<number>('page', { default: 1 })
const totalCount = ref(0)

type FlatSortOptionValue = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc'
const flatSortOption = ref<FlatSortOptionValue>('newest')

const flatSortSelectOptions: SelectOption<FlatSortOptionValue>[] = [
  { label: 'Newest first', value: 'newest' },
  { label: 'Oldest first', value: 'oldest' },
  { label: 'Name (A → Z)', value: 'name-asc' },
  { label: 'Name (Z → A)', value: 'name-desc' },
  { label: 'Size (largest)', value: 'size-desc' },
  { label: 'Size (smallest)', value: 'size-asc' },
]

const flatSortOptionModel = computed<SelectOption<FlatSortOptionValue>[] | undefined>({
  get() {
    const match = flatSortSelectOptions.find(o => o.value === flatSortOption.value)
    return match ? [match] : undefined
  },
  set(selection) {
    flatSortOption.value = selection?.[0]?.value ?? 'newest'
    fetchAssets()
  },
})

function flatSortParams(): { column: FlatSortColumn, order: 'asc' | 'desc' } {
  switch (flatSortOption.value) {
    case 'oldest': return { column: 'updated_at', order: 'asc' }
    case 'name-asc': return { column: 'name', order: 'asc' }
    case 'name-desc': return { column: 'name', order: 'desc' }
    case 'size-desc': return { column: 'size', order: 'desc' }
    case 'size-asc': return { column: 'size', order: 'asc' }
    case 'newest': default: return { column: 'updated_at', order: 'desc' }
  }
}

const paginationState = computed(() => paginate(totalCount.value, page.value, PAGE_SIZE.value))
const shouldShowPagination = computed(() => totalCount.value > PAGE_SIZE.value)

const assetGridColumns = computed(() => {
  if (isBelowMedium.value)
    return 2

  return adminTablePerPage.value > 10 ? 8 : 4
})

const actionLoading = ref<Record<string, Partial<Record<AssetActionKey, boolean>>>>({})

const showDetailsDrawer = ref(false)
const selectedAsset = ref<CmsAsset | null>(null)
const skipNextRefresh = ref(false)
const assetPendingDeletion = ref<CmsAsset | null>(null)
const showDeleteConfirmModal = ref(false)
const assetPendingRename = ref<CmsAsset | null>(null)
const showRenameModal = ref(false)
const renameLoading = ref(false)
const showBulkDeleteConfirmModal = ref(false)
const bulkDeleteLoading = ref(false)

const typeFilterOptions: SelectOption<TypeFilterValue>[] = [
  { label: 'All types', value: 'all' },
  { label: 'Images', value: 'images' },
  { label: 'Documents', value: 'documents' },
  { label: 'Other', value: 'other' },
]

const sortSelectOptions: SelectOption<SortOptionValue>[] = [
  { label: 'Name (A → Z)', value: 'name-asc' },
  { label: 'Name (Z → A)', value: 'name-desc' },
  { label: 'Newest first', value: 'newest' },
  { label: 'Oldest first', value: 'oldest' },
  { label: 'Size (largest)', value: 'size-desc' },
  { label: 'Size (smallest)', value: 'size-asc' },
]

const typeFilterModel = computed<SelectOption<TypeFilterValue>[] | undefined>({
  get() {
    const match = typeFilterOptions.find(option => option.value === typeFilter.value)
    return match ? [match] : undefined
  },
  set(selection) {
    typeFilter.value = selection?.[0]?.value ?? 'all'
  },
})

const sortOptionModel = computed<SelectOption<SortOptionValue>[] | undefined>({
  get() {
    const match = sortSelectOptions.find(option => option.value === sortOption.value)
    return match ? [match] : undefined
  },
  set(selection) {
    sortOption.value = selection?.[0]?.value ?? 'name-asc'
  },
})

const breadcrumbs = computed(() => {
  const normalized = normalizePrefix(currentPrefix.value)
  if (!normalized)
    return [{ label: 'Root', path: '' }]

  const segments = normalized.split('/')
  const crumbs = [{ label: 'Root', path: '' }]
  segments.forEach((segment, index) => {
    const path = segments.slice(0, index + 1).join('/')
    crumbs.push({ label: segment, path })
  })
  return crumbs
})

const documentExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'md']

const filteredAssets = computed(() => {
  const entries = assets.value.filter((asset) => {
    if (asset.type === 'folder')
      return true

    if (typeFilter.value === 'images')
      return isImageAsset(asset)

    if (typeFilter.value === 'documents')
      return documentExtensions.includes(asset.extension ?? '')

    if (typeFilter.value === 'other')
      return !isImageAsset(asset) && !documentExtensions.includes(asset.extension ?? '')

    return true
  })

  const directories = entries
    .filter(asset => asset.type === 'folder')
    .sort((a, b) => a.name.localeCompare(b.name))

  const files = entries.filter(asset => asset.type === 'file')

  // In flat mode the server already sorted; don't clobber with client-side sort.
  if (!flatView.value)
    files.sort((a, b) => sortFiles(a, b))

  return [...directories, ...files]
})

const tableData = computed(() => filteredAssets.value.map(asset => ({
  'id': asset.id || asset.name,
  [flatView.value ? 'Path' : 'Name']: flatView.value ? asset.path : asset.name,
  'Type': getAssetTypeLabel(asset),
  'Size': asset.type === 'folder' ? 0 : asset.size,
  'Last Modified': asset.updated_at ?? asset.created_at ?? '',
  '_original': asset,
})))

const filteredCount = computed(() => filteredAssets.value.length)
const isFiltered = computed(() => filteredCount.value !== assets.value.length)

const isForumsBucket = computed(() => resolvedBucketId.value === FORUMS_BUCKET_ID)

const { headers, rows: tableRows, setSort, selectedRows, deselectAllRows } = defineTable(tableData, {
  pagination: {
    enabled: false,
  },
  select: true,
})

setSort('Name', 'asc')

const nameSortDirection = computed(() => headers.value.find(header => header.label === 'Name')?.sortKey ?? null)

function sortNameFolderFirst(a: (typeof tableRows.value)[number], b: (typeof tableRows.value)[number], direction: 'asc' | 'desc') {
  const aFolder = a._original.type === 'folder'
  const bFolder = b._original.type === 'folder'

  if (aFolder && !bFolder)
    return -1
  if (!aFolder && bFolder)
    return 1

  const nameCompare = a._original.name.localeCompare(b._original.name)
  return direction === 'desc' ? -nameCompare : nameCompare
}

const tableRowsFolderFirst = computed(() => {
  // In flat mode the server already returned rows in the requested sort order;
  // skip any client-side re-sort so we don't clobber the server ordering.
  if (flatView.value)
    return tableRows.value

  if (!nameSortDirection.value)
    return tableRows.value

  return tableRows.value.toSorted((a, b) => sortNameFolderFirst(a, b, nameSortDirection.value as 'asc' | 'desc'))
})

function sortFiles(a: CmsAsset, b: CmsAsset) {
  switch (sortOption.value) {
    case 'name-desc':
      return b.name.localeCompare(a.name)
    case 'size-desc':
      return b.size - a.size
    case 'size-asc':
      return a.size - b.size
    case 'newest':
      return new Date(b.updated_at ?? b.created_at ?? 0).getTime()
        - new Date(a.updated_at ?? a.created_at ?? 0).getTime()
    case 'oldest':
      return new Date(a.updated_at ?? a.created_at ?? 0).getTime()
        - new Date(b.updated_at ?? b.created_at ?? 0).getTime()
    case 'name-asc':
    default:
      return a.name.localeCompare(b.name)
  }
}

async function fetchAssets(silent = false) {
  if (silent) {
    reloading.value = true
  }
  else {
    loading.value = true
    errorMessage.value = ''
    assets.value = []
    totalCount.value = 0
  }
  try {
    if (flatView.value) {
      const { assets: batch, totalCount: count } = await listStorageObjectsFlat(supabase, resolvedBucketId.value, {
        prefix: currentPrefix.value,
        limit: PAGE_SIZE.value,
        offset: (page.value - 1) * PAGE_SIZE.value,
        search: searchQuery.value.trim() || undefined,
        sortBy: flatSortParams(),
      })
      assets.value = batch
      totalCount.value = count
    }
    else {
      const activeSearch = searchQuery.value.trim()
      if (activeSearch) {
        // Search uses the RPC to scan across all pages server-side.
        const { assets: batch, totalCount: count } = await listStorageObjectsFlat(supabase, resolvedBucketId.value, {
          prefix: currentPrefix.value,
          limit: PAGE_SIZE.value,
          offset: (page.value - 1) * PAGE_SIZE.value,
          search: activeSearch,
          sortBy: { column: 'name', order: 'asc' },
        })
        assets.value = batch
        totalCount.value = count
      }
      else {
        // Fetch all direct children at this prefix level via the Storage API.
        // listCmsDirectory already handles internal pagination (loops until done).
        // Paginate the result client-side so counts and offsets are always accurate.
        const allEntries = await listCmsDirectory(supabase, resolvedBucketId.value, { prefix: currentPrefix.value })
        totalCount.value = allEntries.length
        const start = (page.value - 1) * PAGE_SIZE.value
        assets.value = allEntries.slice(start, start + PAGE_SIZE.value)
      }
    }
  }
  catch (error) {
    console.error('Failed to load assets', error)
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load assets'
  }
  finally {
    loading.value = false
    reloading.value = false
  }
}

function setPage(n: number) {
  page.value = n
  // fetch is driven by watch(page) below
}

function changePrefix(path: string) {
  const normalized = normalizePrefix(path)
  if (normalized === currentPrefix.value)
    return
  currentPrefix.value = normalized
}

function openFolder(asset: CmsAsset) {
  if (asset.type === 'folder')
    changePrefix(asset.path)
}

function openDetails(asset: CmsAsset) {
  if (asset.type !== 'file')
    return
  selectedAsset.value = asset
  showDetailsDrawer.value = true
}

async function performDeleteAsset(asset: CmsAsset) {
  if (asset.type === 'folder') {
    const files = await listCmsFilesRecursive(supabase, resolvedBucketId.value, asset.path)
    if (files.length) {
      const { error } = await supabase.storage
        .from(resolvedBucketId.value)
        .remove(files.map(file => file.path))
      if (error)
        throw error
    }
  }
  else {
    const { error } = await supabase.storage
      .from(resolvedBucketId.value)
      .remove([asset.path])
    if (error)
      throw error
  }
}

async function deleteAsset(asset: CmsAsset) {
  setActionLoading(asset.path, 'delete', true)
  try {
    await performDeleteAsset(asset)

    pushToast(`${asset.type === 'folder' ? 'Folder' : 'File'} deleted`)
    await fetchAssets(true)
    notifyPeers()
  }
  catch (error) {
    console.error('Failed to delete asset', error)
    pushToast('Unable to delete asset')
  }
  finally {
    setActionLoading(asset.path, 'delete', false)
  }
}

function promptDeleteAsset(asset: CmsAsset) {
  assetPendingDeletion.value = asset
  showDeleteConfirmModal.value = true
}

function confirmDeleteAsset() {
  if (!assetPendingDeletion.value)
    return
  deleteAsset(assetPendingDeletion.value)
  showDeleteConfirmModal.value = false
  assetPendingDeletion.value = null
}

async function handleBulkDeleteAssets() {
  if (selectedRows.value.length === 0)
    return

  const targets = selectedRows.value.map(row => row._original)
  bulkDeleteLoading.value = true

  try {
    for (const asset of targets)
      await performDeleteAsset(asset)

    pushToast(`Deleted ${targets.length} asset${targets.length === 1 ? '' : 's'}`)
    showBulkDeleteConfirmModal.value = false
    deselectAllRows()

    if (selectedAsset.value && targets.some(asset => asset.path === selectedAsset.value?.path)) {
      selectedAsset.value = null
      showDetailsDrawer.value = false
    }

    await fetchAssets(true)
    notifyPeers()
  }
  catch {
    pushToast('Unable to delete selected assets')
  }
  finally {
    bulkDeleteLoading.value = false
  }
}

async function handleBulkDownload() {
  downloadLoading.value = true

  const paths = selectedRows.value
    .map(row => row._original.publicUrl)
    .filter(url => !!url) as string[]

  await zipAndDownloadAssets(paths, `hivecom-assets-${Date.now()}`)

  downloadLoading.value = false
}

function canRenameAsset(asset: CmsAsset): boolean {
  return canDelete.value && asset.type === 'file'
}

function promptRenameAsset(asset: CmsAsset) {
  if (!canRenameAsset(asset))
    return
  assetPendingRename.value = asset
  showRenameModal.value = true
}

async function handleRenameSubmit(newName: string) {
  const target = assetPendingRename.value
  if (!target)
    return
  if (target.type !== 'file') {
    pushToast('Only files can be renamed at this time')
    return
  }

  const newPath = await renameFileAsset(target, newName)
  if (!newPath)
    return

  if (selectedAsset.value && selectedAsset.value.path === target.path) {
    selectedAsset.value = {
      ...selectedAsset.value,
      name: newName,
      path: newPath,
    }
  }

  showRenameModal.value = false
  assetPendingRename.value = null
}

async function renameFileAsset(asset: CmsAsset, newPathInput: string): Promise<string | null> {
  const trimmed = normalizePrefix(newPathInput)
  if (!trimmed) {
    pushToast('Path is required')
    return null
  }

  const targetPath = trimmed
  if (targetPath === asset.path) {
    pushToast('Path is unchanged')
    return null
  }

  renameLoading.value = true
  setActionLoading(asset.path, 'rename', true)
  try {
    const { error } = await supabase.storage
      .from(resolvedBucketId.value)
      .move(asset.path, targetPath)
    if (error)
      throw error

    pushToast('File renamed')
    await fetchAssets(true)
    notifyPeers()
    return targetPath
  }
  catch (error) {
    console.error('Failed to rename asset', error)
    pushToast('Unable to rename asset')
    return null
  }
  finally {
    renameLoading.value = false
    setActionLoading(asset.path, 'rename', false)
  }
}

function setActionLoading(path: string, action: AssetActionKey, state: boolean) {
  actionLoading.value = {
    ...actionLoading.value,
    [path]: {
      ...(actionLoading.value[path] ?? {}),
      [action]: state,
    },
  }
}

function isActionLoading(path: string, action: AssetActionKey): boolean {
  return !!actionLoading.value[path]?.[action]
}

function handleRowClick(asset: CmsAsset) {
  if (asset.type === 'folder')
    openFolder(asset)
  else
    openDetails(asset)
}

function notifyPeers() {
  skipNextRefresh.value = true
  refreshSignal.value = (refreshSignal.value || 0) + 1
}

function getAssetBadgeVariant(asset: CmsAsset): BadgeVariant {
  if (asset.type === 'folder')
    return 'info'
  return isImageAsset(asset) ? 'success' : 'neutral'
}

function getAssetTypeLabel(asset: CmsAsset): string {
  if (asset.type === 'folder')
    return 'Folder'
  if (isImageAsset(asset))
    return 'Image'
  if (documentExtensions.includes(asset.extension ?? ''))
    return 'Document'
  return 'File'
}

watch(flatView, (val) => {
  if (val) {
    currentPrefix.value = ''
    // Clear defineTable's client-side sort so server ordering is preserved in flat mode.
    setSort('', 'asc')
  }
  else {
    // Restore default name-asc sort for non-flat table view.
    setSort('Name', 'asc')
  }
  if (page.value !== 1) {
    page.value = 1
    // page watch triggers fetch
  }
  else {
    fetchAssets()
  }
})

watch(resolvedBucketId, () => {
  currentPrefix.value = ''
  if (page.value !== 1) {
    page.value = 1
    // page watch triggers fetch
  }
  else {
    fetchAssets()
  }
})

watch(adminTablePerPage, () => {
  if (page.value !== 1) {
    page.value = 1
    // page watch will trigger fetch
  }
  else {
    void fetchAssets()
  }
})

watch(currentPrefix, () => {
  if (page.value !== 1) {
    page.value = 1
    // page watch triggers fetch
  }
  else {
    fetchAssets()
  }
})

watchDebounced(searchQuery, () => {
  if (page.value !== 1) {
    page.value = 1
    // page watch triggers fetch
  }
  else {
    void fetchAssets(true)
  }
}, { debounce: 300 })

// Page change drives silent re-fetch
watch(page, () => {
  void fetchAssets(true)
})

watch(() => refreshSignal.value, (newValue, oldValue) => {
  if (skipNextRefresh.value) {
    skipNextRefresh.value = false
    return
  }
  if (newValue !== oldValue)
    fetchAssets()
})

watch(showDetailsDrawer, (isOpen) => {
  if (!isOpen)
    selectedAsset.value = null
})

watch(showRenameModal, (isOpen) => {
  if (!isOpen)
    assetPendingRename.value = null
})

onBeforeMount(fetchAssets)
</script>

<template>
  <Flex column gap="l" expand>
    <Flex column gap="s" expand>
      <Breadcrumbs v-if="!flatView">
        <BreadcrumbItem
          v-for="(crumb, index) in breadcrumbs"
          :key="crumb.path || `crumb-${index}`"
          :href="crumb.path !== currentPrefix ? '#' : undefined"
          @click="changePrefix(crumb.path), $event.preventDefault()"
        >
          {{ crumb.label || 'Root' }}
        </BreadcrumbItem>
      </Breadcrumbs>

      <Flex
        :column="isBelowMedium"
        gap="xs"
        wrap
        :x-between="!isBelowMedium"
        :x-start="isBelowMedium"
        :y-center="!isBelowMedium"
        :y-start="isBelowMedium"
        expand
      >
        <Flex :gap="isBelowMedium ? 's' : 'xs'" wrap :expand="isBelowMedium">
          <Input v-model="searchQuery" :expand="isBelowMedium" placeholder="Search by name or path">
            <template #start>
              <Icon name="ph:magnifying-glass" />
            </template>
          </Input>

          <ExpandableSelect
            v-model="typeFilterModel"
            :options="typeFilterOptions"
            placeholder="Filter by type"
            single
            show-clear
            :expand="isBelowMedium"
          />

          <ExpandableSelect
            v-if="viewMode === 'grid' && !flatView"
            v-model="sortOptionModel"
            :options="sortSelectOptions"
            placeholder="Sort files"
            single
            :expand="isBelowMedium"
          />

          <ExpandableSelect
            v-if="flatView"
            v-model="flatSortOptionModel"
            :options="flatSortSelectOptions"
            placeholder="Sort by"
            single
            :expand="isBelowMedium"
          />
        </Flex>

        <Flex
          :gap="isBelowMedium ? 's' : 'xs'"
          wrap
          :y-center="!isBelowMedium"
          :y-start="isBelowMedium"
          :expand="isBelowMedium"
          :x-end="!isBelowMedium"
          :column-reverse="isBelowMedium"
        >
          <span class="text-s text-color-lighter">
            {{ filteredCount }}{{ isFiltered ? ` of ${assets.length}` : '' }} items{{ totalCount > assets.length ? ` (${totalCount} total)` : '' }}
          </span>

          <Flex gap="xs" :expand="isBelowMedium" :x-between="isBelowMedium">
            <ButtonGroup :expand="isBelowMedium">
              <Button
                size="s"
                :variant="viewMode === 'table' ? 'accent' : 'gray'"
                :square="!isBelowMedium"
                :expand="isBelowMedium"
                @click="viewMode = 'table'"
              >
                <Icon name="ph:list" />
              </Button>
              <Button
                size="s"
                :variant="viewMode === 'grid' ? 'accent' : 'gray'"
                :square="!isBelowMedium"
                :expand="isBelowMedium"
                @click="viewMode = 'grid'"
              >
                <Icon name="ph:squares-four" />
              </Button>
            </ButtonGroup>

            <Tooltip>
              <Button
                size="s"
                :variant="flatView ? 'accent' : 'gray'"
                :square="!isBelowMedium"
                :expand="isBelowMedium"
                @click="flatView = !flatView"
              >
                <Icon name="ph:rows" />
              </Button>
              <template #tooltip>
                <p>{{ flatView ? 'Flat view - all files' : 'Switch to flat view' }}</p>
              </template>
            </Tooltip>
          </Flex>
        </Flex>
      </Flex>

      <Alert v-if="errorMessage" variant="danger">
        {{ errorMessage }}
      </Alert>

      <TableSkeleton v-if="loading && viewMode === 'table'" :columns="4" :rows="6" />
      <Grid
        v-else-if="loading && viewMode === 'grid'"
        class="asset-manager__grid"
        expand
        :columns="assetGridColumns"
      >
        <Skeleton v-for="i in PAGE_SIZE" :key="i" :height="207" :radius="8" />
      </Grid>

      <Flex v-else expand class="asset-manager__content" :class="{ 'is-reloading': reloading }">
        <TableContainer v-if="viewMode === 'table'">
          <Table.Root v-if="tableRows.length" separate-cells>
            <template #header>
              <th class="vui-table-interactive-cell" />
              <Table.Head
                v-for="header in headers.filter((header: { label: string }) => header.label !== '_original' && header.label !== 'id')"
                :key="header.label"
                :sort="!flatView"
                :header="header"
              />
              <Table.Head
                key="actions"
                :header="{ label: 'Actions',
                           sortToggle: () => {} }"
              />
            </template>

            <template #body>
              <tr
                v-for="row in tableRowsFolderFirst"
                :key="row._original.path || row._original.name"
                class="asset-manager__row"
              >
                <Table.SelectRow v-if="row._original.type === 'file'" :row="row" />
                <td v-else class="vui-table-interactive-cell" />
                <Table.Cell @click="handleRowClick(row._original)">
                  <Flex gap="xs" y-center class="h-100">
                    <Icon :name="row._original.type === 'folder' ? 'ph:folder-simple' : 'ph:file'" />
                    <Tooltip v-if="flatView" :disabled="row._original.path.length <= 40">
                      <span class="text-s">{{ truncate(row._original.path, 40) }}</span>
                      <template #tooltip>
                        <p style="max-width: 512px" class="text-s">
                          {{ row._original.path }}
                        </p>
                      </template>
                    </Tooltip>
                    <span v-else class="text-s">{{ row._original.name }}</span>
                  </Flex>
                </Table.Cell>
                <Table.Cell @click="handleRowClick(row._original)">
                  <Badge :variant="getAssetBadgeVariant(row._original)">
                    {{ getAssetTypeLabel(row._original) }}
                  </Badge>
                </Table.Cell>
                <Table.Cell @click="handleRowClick(row._original)">
                  {{ row._original.type === 'folder' ? '-' : formatBytes(row._original.size) }}
                </Table.Cell>
                <Table.Cell @click="handleRowClick(row._original)">
                  {{ row._original.updated_at ? fullDateTime(row._original.updated_at) : '-' }}
                </Table.Cell>
                <Table.Cell @click.stop>
                  <Flex gap="xxs">
                    <CopyClipboard
                      v-if="row._original.type === 'file'"
                      :text="row._original.publicUrl || ''"
                      confirm
                    >
                      <Tooltip>
                        <Button
                          size="s"
                          variant="gray"
                          square
                          :disabled="!row._original.publicUrl"
                        >
                          <Icon name="ph:link-simple" />
                        </Button>
                        <template #tooltip>
                          <p>Copy URL</p>
                        </template>
                      </Tooltip>
                    </CopyClipboard>
                    <Tooltip v-if="canRenameAsset(row._original)">
                      <Button
                        size="s"
                        variant="gray"
                        square
                        :loading="isActionLoading(row._original.path, 'rename')"
                        @click="promptRenameAsset(row._original)"
                      >
                        <Icon name="ph:text-t" />
                      </Button>
                      <template #tooltip>
                        <p>Rename</p>
                      </template>
                    </Tooltip>
                    <Tooltip v-if="canDelete">
                      <Button
                        size="s"
                        variant="danger"
                        square
                        :loading="isActionLoading(row._original.path, 'delete')"
                        @click="promptDeleteAsset(row._original)"
                      >
                        <Icon name="ph:trash" />
                      </Button>
                      <template #tooltip>
                        <p>Delete</p>
                      </template>
                    </Tooltip>
                  </Flex>
                </Table.Cell>
              </tr>
            </template>
          </Table.Root>

          <Flex v-else expand>
            <Alert variant="info">
              No assets found in this folder.
            </Alert>
          </Flex>
        </TableContainer>

        <Flex v-else expand>
          <AssetGrid
            v-if="filteredAssets.length"
            :assets="filteredAssets"
            :columns="assetGridColumns"
            :can-delete="canDelete"
            :is-forums-bucket="isForumsBucket"
            @click-asset="handleRowClick"
            @delete-asset="promptDeleteAsset"
          />
          <Flex v-else expand>
            <Alert variant="info">
              No assets found in this folder.
            </Alert>
          </Flex>
        </Flex>
      </Flex>

      <SelectedRowsActions
        v-if="viewMode === 'table'"
        :selected-count="selectedRows.length"
        @clear="deselectAllRows()"
      >
        <DropdownItem
          :disabled="downloadLoading"
          @click="handleBulkDownload"
        >
          <template #icon>
            <Icon name="ph:download-simple" class="text-color-blue" />
          </template>
          Download
          <template #iconEnd>
            <Spinner v-if="downloadLoading" size="s" />
          </template>
          <template #hint>
            {{ selectedRows.length }}
          </template>
        </DropdownItem>
        <DropdownItem
          v-if="canDelete"
          :disabled="bulkDeleteLoading"
          @click="showBulkDeleteConfirmModal = true"
        >
          <template #icon>
            <Icon name="ph:trash" class="text-color-red" />
          </template>
          Delete
          <template #hint>
            {{ selectedRows.length }}
          </template>
        </DropdownItem>
      </SelectedRowsActions>

      <Flex v-if="shouldShowPagination" x-center expand>
        <Pagination :pagination="paginationState" @change="setPage" />
      </Flex>
    </Flex>

    <AssetDetails
      v-model:is-open="showDetailsDrawer"
      :asset="selectedAsset"
      @delete="promptDeleteAsset"
      @rename="promptRenameAsset"
    />

    <AssetRenameModal
      v-model:open="showRenameModal"
      :asset="assetPendingRename"
      :loading="renameLoading"
      @submit="handleRenameSubmit"
    />

    <ConfirmModal
      v-model:open="showDeleteConfirmModal"
      :confirm="confirmDeleteAsset"
      :title="assetPendingDeletion?.type === 'folder' ? 'Delete Folder' : 'Delete File'"
      :description="assetPendingDeletion ? `Are you sure you want to delete '${assetPendingDeletion.name}'? This action cannot be undone.` : ''"
      confirm-text="Delete"
      cancel-text="Cancel"
      :destructive="true"
    />

    <ConfirmModal
      v-model:open="showBulkDeleteConfirmModal"
      :confirm="handleBulkDeleteAssets"
      :confirm-loading="bulkDeleteLoading"
      :title="`Delete ${selectedRows.length} assets`"
      :description="`Are you sure you want to delete ${selectedRows.length} selected assets? This action cannot be undone.`"
      confirm-text="Delete"
      cancel-text="Cancel"
      :destructive="true"
    />
  </flex>
</template>

<style scoped lang="scss">
.asset-manager {
  &__content {
    transition: opacity var(--transition-slow);

    &.is-reloading {
      opacity: 0.4;
      pointer-events: none;
    }
  }

  &__row {
    cursor: pointer;

    &:hover td {
      background-color: var(--color-bg-raised);
    }
  }
}
</style>
