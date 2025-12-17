<script setup lang="ts">
import type { CmsAsset } from '@/lib/cmsAssets'
import { Alert, Badge, Button, Card, CopyClipboard, defineTable, Flex, Grid, Input, pushToast, Select, Table, Toasts } from '@dolanske/vui'

import { computed, onBeforeMount, ref, watch } from 'vue'
import AssetDetails from '@/components/Admin/Assets/AssetDetails.vue'
import AssetRenameModal from '@/components/Admin/Assets/AssetRenameModal.vue'
import AssetUpload from '@/components/Admin/Assets/AssetUpload.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import { CMS_BUCKET_ID, formatBytes, isImageAsset, listCmsDirectory, listCmsFilesRecursive, normalizePrefix } from '@/lib/cmsAssets'

interface Props {
  canUpload?: boolean
  canDelete?: boolean
}

interface SelectOption<T extends string = string> {
  label: string
  value: T
}

type TypeFilterValue = 'all' | 'images' | 'documents' | 'other'
type SortOptionValue = 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc' | 'newest' | 'oldest'
type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'accent'

const props = withDefaults(defineProps<Props>(), {
  canUpload: false,
  canDelete: false,
})

const supabase = useSupabaseClient()
const runtimeConfig = useRuntimeConfig()
const storageConsoleUrl = computed(() => {
  const projectRef = runtimeConfig.public?.supabaseProjectRef
  if (typeof projectRef !== 'string' || projectRef.length === 0)
    return ''
  return `https://supabase.com/dashboard/project/${projectRef}/storage/buckets/${CMS_BUCKET_ID}`
})
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const loading = ref(true)
const errorMessage = ref('')
const assets = ref<CmsAsset[]>([])
const currentPrefix = ref('')
const searchQuery = ref('')
const typeFilter = ref<TypeFilterValue>('all')
const sortOption = ref<SortOptionValue>('name-asc')
const viewMode = ref<'table' | 'grid'>('table')
type AssetActionKey = 'delete' | 'rename'

const actionLoading = ref<Record<string, Partial<Record<AssetActionKey, boolean>>>>({})

const showUploadDrawer = ref(false)
const showDetailsDrawer = ref(false)
const selectedAsset = ref<CmsAsset | null>(null)
const skipNextRefresh = ref(false)
const assetPendingDeletion = ref<CmsAsset | null>(null)
const showDeleteConfirmModal = ref(false)
const assetPendingRename = ref<CmsAsset | null>(null)
const showRenameModal = ref(false)
const renameLoading = ref(false)

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
  const normalizedSearch = searchQuery.value.trim().toLowerCase()

  const entries = assets.value.filter((asset) => {
    const matchesSearch = normalizedSearch
      ? asset.name.toLowerCase().includes(normalizedSearch)
      || asset.path.toLowerCase().includes(normalizedSearch)
      : true

    if (!matchesSearch)
      return false

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

  const files = entries
    .filter(asset => asset.type === 'file')
    .sort((a, b) => sortFiles(a, b))

  return [...directories, ...files]
})

const tableData = computed(() => filteredAssets.value.map(asset => ({
  'Name': asset.name,
  'Type': getAssetTypeLabel(asset),
  'Size': asset.type === 'folder' ? 0 : asset.size,
  'Last Modified': asset.updated_at ?? asset.created_at ?? '',
  '_original': asset,
})))

const { headers, rows: tableRows, setSort } = defineTable(tableData, {
  pagination: {
    enabled: false,
  },
  select: false,
})

setSort('Name', 'asc')

function sortFiles(a: CmsAsset, b: CmsAsset) {
  switch (sortOption.value) {
    case 'name-desc':
      return b.name.localeCompare(a.name)
    case 'size-desc':
      return b.size - a.size
    case 'size-asc':
      return a.size - b.size
    case 'newest':
      return new Date(b.created_at ?? b.updated_at ?? 0).getTime()
        - new Date(a.created_at ?? a.updated_at ?? 0).getTime()
    case 'oldest':
      return new Date(a.created_at ?? a.updated_at ?? 0).getTime()
        - new Date(b.created_at ?? b.updated_at ?? 0).getTime()
    case 'name-asc':
    default:
      return a.name.localeCompare(b.name)
  }
}

async function fetchAssets() {
  loading.value = true
  errorMessage.value = ''
  try {
    const entries = await listCmsDirectory(supabase, { prefix: currentPrefix.value })
    assets.value = entries
  }
  catch (error) {
    console.error('Failed to load assets', error)
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load assets'
  }
  finally {
    loading.value = false
  }
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

async function deleteAsset(asset: CmsAsset) {
  setActionLoading(asset.path, 'delete', true)
  try {
    if (asset.type === 'folder') {
      const files = await listCmsFilesRecursive(supabase, asset.path)
      if (files.length) {
        const { error } = await supabase.storage
          .from(CMS_BUCKET_ID)
          .remove(files.map(file => file.path))
        if (error)
          throw error
      }
    }
    else {
      const { error } = await supabase.storage
        .from(CMS_BUCKET_ID)
        .remove([asset.path])
      if (error)
        throw error
    }

    pushToast(`${asset.type === 'folder' ? 'Folder' : 'File'} deleted`)
    await fetchAssets()
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

function canRenameAsset(asset: CmsAsset): boolean {
  return props.canDelete && asset.type === 'file'
}

function promptRenameAsset(asset: CmsAsset) {
  if (!canRenameAsset(asset))
    return
  assetPendingRename.value = asset
  showRenameModal.value = true
  showDetailsDrawer.value = false
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
  showDetailsDrawer.value = false
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
      .from(CMS_BUCKET_ID)
      .move(asset.path, targetPath)
    if (error)
      throw error

    pushToast('File renamed')
    await fetchAssets()
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

function handleUploadSuccess(paths: string[]) {
  if (paths.length)
    pushToast(`${paths.length} file${paths.length > 1 ? 's' : ''} uploaded`)
  fetchAssets()
  notifyPeers()
}

function notifyPeers() {
  skipNextRefresh.value = true
  refreshSignal.value = (refreshSignal.value || 0) + 1
}

function openStorageConsole() {
  if (!storageConsoleUrl.value)
    return
  window.open(storageConsoleUrl.value, '_blank', 'noopener')
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

watch(currentPrefix, () => {
  fetchAssets()
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
      <div class="asset-manager__breadcrumbs" role="navigation" aria-label="Breadcrumb">
        <template v-for="(crumb, index) in breadcrumbs" :key="crumb.path || `crumb-${index}`">
          <button
            v-if="crumb.path !== currentPrefix"
            type="button"
            class="asset-manager__breadcrumb"
            @click="changePrefix(crumb.path)"
          >
            {{ crumb.label || 'Root' }}
          </button>
          <span v-else class="asset-manager__breadcrumb asset-manager__breadcrumb--current">
            {{ crumb.label || 'Root' }}
          </span>
          <Icon
            v-if="index < breadcrumbs.length - 1"
            name="ph:caret-right"
            size="12"
            class="asset-manager__breadcrumb-separator"
          />
        </template>
      </div>

      <Flex gap="s" wrap expand>
        <Input v-model="searchQuery" expand placeholder="Search by name or path" style="max-width: 260px;">
          <template #start>
            <Icon name="ph:magnifying-glass" />
          </template>
        </Input>

        <Select
          v-model="typeFilterModel"
          :options="typeFilterOptions"
          placeholder="Filter by type"
          single
          show-clear
          style="width: 160px;"
        />

        <Select
          v-if="viewMode === 'grid'"
          v-model="sortOptionModel"
          :options="sortSelectOptions"
          placeholder="Sort files"
          single
          style="width: 190px;"
        />

        <Flex gap="xs" class="asset-manager__view-toggle">
          <Button
            :variant="viewMode === 'table' ? 'accent' : 'gray'"
            square
            @click="viewMode = 'table'"
          >
            <Icon name="ph:list" />
          </Button>
          <Button
            :variant="viewMode === 'grid' ? 'accent' : 'gray'"
            square
            @click="viewMode = 'grid'"
          >
            <Icon name="ph:squares-four" />
          </Button>
        </Flex>

        <Flex gap="xs" class="asset-manager__toolbar-actions">
          <Button variant="gray" @click="fetchAssets">
            <template #start>
              <Icon name="ph:arrow-clockwise" />
            </template>
            Refresh
          </Button>
          <Button
            v-if="storageConsoleUrl"
            variant="gray"
            :disabled="!storageConsoleUrl"
            @click="openStorageConsole"
          >
            <template #start>
              <Icon name="ph:folder-open" />
            </template>
            Supabase Files
          </Button>
          <Button
            v-if="props.canUpload"
            variant="accent"
            @click="showUploadDrawer = true"
          >
            <template #start>
              <Icon name="ph:upload" />
            </template>
            Upload
          </Button>
        </Flex>
      </Flex>
    </Flex>

    <Alert v-if="errorMessage" variant="danger">
      {{ errorMessage }}
    </Alert>

    <TableSkeleton v-if="loading" :columns="4" :rows="6" />

    <template v-else>
      <TableContainer v-if="viewMode === 'table'">
        <Table.Root v-if="tableRows.length" separate-cells>
          <template #header>
            <Table.Head
              v-for="header in headers.filter(header => header.label !== '_original')"
              :key="header.label"
              sort
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
              v-for="row in tableRows"
              :key="row._original.path || row._original.name"
              class="asset-manager__row"
              @click="handleRowClick(row._original)"
            >
              <Table.Cell>
                <Flex gap="xs" y-center>
                  <Icon :name="row._original.type === 'folder' ? 'ph:folder-simple' : 'ph:file'" />
                  <span>{{ row._original.name }}</span>
                </Flex>
              </Table.Cell>
              <Table.Cell>
                <Badge :variant="getAssetBadgeVariant(row._original)">
                  {{ getAssetTypeLabel(row._original) }}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                {{ row._original.type === 'folder' ? '—' : formatBytes(row._original.size) }}
              </Table.Cell>
              <Table.Cell>{{ row._original.updated_at ? new Date(row._original.updated_at).toLocaleString() : '—' }}</Table.Cell>
              <Table.Cell @click.stop>
                <Flex gap="xs">
                  <CopyClipboard
                    v-if="row._original.type === 'file'"
                    :text="row._original.publicUrl || ''"
                    confirm
                  >
                    <Button
                      size="s"
                      variant="gray"
                      square
                      :disabled="!row._original.publicUrl"
                      data-title-top="Copy URL"
                    >
                      <Icon name="ph:link-simple" />
                    </Button>
                  </CopyClipboard>
                  <Button
                    v-if="canRenameAsset(row._original)"
                    size="s"
                    variant="gray"
                    square
                    :loading="isActionLoading(row._original.path, 'rename')"
                    data-title-top="Rename"
                    @click="promptRenameAsset(row._original)"
                  >
                    <Icon name="ph:text-t" />
                  </Button>
                  <Button
                    v-if="props.canDelete"
                    size="s"
                    variant="danger"
                    square
                    :loading="isActionLoading(row._original.path, 'delete')"
                    data-title-top="Delete"
                    @click="promptDeleteAsset(row._original)"
                  >
                    <Icon name="ph:trash" />
                  </Button>
                </Flex>
              </Table.Cell>
            </tr>
          </template>
        </Table.Root>

        <Alert v-else variant="info">
          No assets found in this folder.
        </Alert>
      </TableContainer>

      <div v-else>
        <Grid
          v-if="filteredAssets.length"
          class="asset-manager__grid"
          expand
          :columns="4"
        >
          <Card
            v-for="asset in filteredAssets"
            :key="asset.path"
            class="asset-manager__grid-card"
            @click="handleRowClick(asset)"
          >
            <div class="asset-manager__grid-preview" :class="{ 'is-folder': asset.type === 'folder' }">
              <template v-if="asset.type === 'folder'">
                <Icon name="ph:folder-simple" size="32" />
              </template>
              <template v-else-if="isImageAsset(asset) && asset.publicUrl">
                <img :src="asset.publicUrl" :alt="asset.name">
              </template>
              <template v-else>
                <Icon name="ph:file" size="32" />
              </template>
            </div>
            <Flex column gap="xxs">
              <strong class="text-s">{{ asset.name }}</strong>
              <span class="text-xxs text-color-light">{{ asset.type === 'folder' ? 'Folder' : formatBytes(asset.size) }}</span>
            </Flex>
          </Card>
        </Grid>
        <Alert v-else variant="info">
          No assets found in this folder.
        </Alert>
      </div>
    </template>
  </Flex>

  <AssetUpload
    v-model:is-open="showUploadDrawer"
    :can-upload="props.canUpload"
    :current-prefix="currentPrefix"
    @uploaded="handleUploadSuccess"
  />

  <AssetDetails
    v-model:is-open="showDetailsDrawer"
    :asset="selectedAsset"
    :can-delete="props.canDelete"
    :can-rename="props.canDelete"
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
    v-model:confirm="confirmDeleteAsset"
    :title="assetPendingDeletion?.type === 'folder' ? 'Delete Folder' : 'Delete File'"
    :description="assetPendingDeletion ? `Are you sure you want to delete '${assetPendingDeletion.name}'? This action cannot be undone.` : ''"
    confirm-text="Delete"
    cancel-text="Cancel"
    :destructive="true"
  />

  <Toasts />
</template>

<style scoped lang="scss">
.asset-manager {
  &__breadcrumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xxs);
    font-size: 0.95rem;
  }

  &__breadcrumb {
    background: transparent;
    border: none;
    padding: 0;
    color: var(--color-text);
    font-weight: 600;
    cursor: pointer;
    transition: color 0.15s ease;

    &:hover {
      color: var(--color-accent);
    }

    &--current {
      color: var(--color-text-light);
      cursor: default;
      pointer-events: none;
    }
  }

  &__breadcrumb-separator {
    color: var(--color-text-light);
  }

  &__toolbar-actions {
    margin-left: auto;
  }

  &__row {
    cursor: pointer;

    &:hover td {
      background-color: var(--color-bg-raised);
    }
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--space-m);
  }

  &__grid-card {
    cursor: pointer;
    transition: border-color 0.2s ease;

    &:hover {
      border-color: var(--color-accent);
    }
  }

  &__grid-preview {
    width: 100%;
    height: 140px;
    border-radius: var(--border-radius-m);
    margin-bottom: var(--space-s);
    background: var(--color-bg-raised);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    &.is-folder {
      color: var(--color-text-light);
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }
}
</style>
