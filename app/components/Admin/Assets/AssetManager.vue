<script setup lang="ts">
import type { CmsAsset } from '@/lib/utils/cmsAssets'
import { Alert, Badge, Button, Card, defineTable, Flex, Input, pushToast, Select, Table, Toasts } from '@dolanske/vui'

import { computed, onBeforeMount, ref, watch } from 'vue'
import AssetDetails from '@/components/Admin/Assets/AssetDetails.vue'
import AssetUpload from '@/components/Admin/Assets/AssetUpload.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import { CMS_BUCKET_ID, formatBytes, isImageAsset, listCmsDirectory, listCmsFilesRecursive, normalizePrefix } from '@/lib/utils/cmsAssets'

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
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const loading = ref(true)
const errorMessage = ref('')
const assets = ref<CmsAsset[]>([])
const currentPrefix = ref('')
const searchQuery = ref('')
const typeFilter = ref<TypeFilterValue>('all')
const sortOption = ref<SortOptionValue>('name-asc')
const viewMode = ref<'table' | 'grid'>('table')
const actionLoading = ref<Record<string, boolean>>({})

const showUploadDrawer = ref(false)
const showDetailsDrawer = ref(false)
const selectedAsset = ref<CmsAsset | null>(null)
const skipNextRefresh = ref(false)

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

const { rows: tableRows } = defineTable(filteredAssets, {
  pagination: {
    enabled: false,
  },
  select: false,
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

async function copyValue(value: string, label: string) {
  if (!value)
    return
  try {
    await navigator.clipboard.writeText(value)
    pushToast(`${label} copied`)
  }
  catch (error) {
    console.error('Clipboard error', error)
    pushToast('Failed to copy value')
  }
}

async function deleteAsset(asset: CmsAsset) {
  setActionLoading(asset.path, true)
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
    setActionLoading(asset.path, false)
  }
}

function setActionLoading(path: string, state: boolean) {
  actionLoading.value = {
    ...actionLoading.value,
    [path]: state,
  }
}

function isActionLoading(path: string): boolean {
  return !!actionLoading.value[path]
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

function getAssetBadgeVariant(asset: CmsAsset): BadgeVariant {
  if (asset.type === 'folder')
    return 'info'
  return isImageAsset(asset) ? 'success' : 'neutral'
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

onBeforeMount(fetchAssets)
</script>

<template>
  <Flex column gap="l" expand>
    <Card class="asset-manager__toolbar">
      <Flex column gap="s">
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
    </Card>

    <Alert v-if="errorMessage" variant="danger">
      {{ errorMessage }}
    </Alert>

    <TableSkeleton v-if="loading" :columns="4" :rows="6" />

    <template v-else>
      <TableContainer v-if="viewMode === 'table'">
        <Table.Root v-if="tableRows.length" separate-cells>
          <template #header>
            <Table.Head>Name</Table.Head>
            <Table.Head>Type</Table.Head>
            <Table.Head>Size</Table.Head>
            <Table.Head>Last Modified</Table.Head>
            <Table.Head>Actions</Table.Head>
          </template>

          <template #body>
            <tr
              v-for="asset in tableRows"
              :key="asset.path || asset.name"
              class="asset-manager__row"
              @click="handleRowClick(asset)"
            >
              <Table.Cell>
                <Flex gap="xs" y-center>
                  <Icon :name="asset.type === 'folder' ? 'ph:folder-simple' : 'ph:file'" />
                  <span>{{ asset.name }}</span>
                </Flex>
              </Table.Cell>
              <Table.Cell>
                <Badge :variant="getAssetBadgeVariant(asset)">
                  {{ asset.type === 'folder' ? 'Folder' : (isImageAsset(asset) ? 'Image' : (documentExtensions.includes(asset.extension ?? '') ? 'Document' : 'File')) }}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                {{ asset.type === 'folder' ? '—' : formatBytes(asset.size) }}
              </Table.Cell>
              <Table.Cell>{{ asset.updated_at ? new Date(asset.updated_at).toLocaleString() : '—' }}</Table.Cell>
              <Table.Cell @click.stop>
                <Flex gap="xs">
                  <Button size="s" variant="gray" square @click="asset.type === 'folder' ? openFolder(asset) : openDetails(asset)">
                    <Icon :name="asset.type === 'folder' ? 'ph:folder-simple' : 'ph:eye'" />
                  </Button>
                  <Button
                    v-if="asset.type === 'file'"
                    size="s"
                    variant="gray"
                    square
                    :disabled="!asset.publicUrl"
                    @click="copyValue(asset.publicUrl || '', 'URL')"
                  >
                    <Icon name="ph:link-simple" />
                  </Button>
                  <Button
                    v-if="props.canDelete"
                    size="s"
                    variant="danger"
                    square
                    :loading="isActionLoading(asset.path)"
                    @click="deleteAsset(asset)"
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
        <div v-if="filteredAssets.length" class="asset-manager__grid">
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
        </div>
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
    @delete="deleteAsset"
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
