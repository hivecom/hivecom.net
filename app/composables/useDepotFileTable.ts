import type { Ref, WatchSource } from 'vue'
import type { AdminListFilesOptions, DepotFile, DepotFilePage } from '@/composables/useDepot'
import type { StorageAsset } from '@/lib/storageAssets'
import { defineTable, paginate, pushToast } from '@dolanske/vui'
import { watchDebounced } from '@vueuse/core'
import { computed, onBeforeMount, ref, watch } from 'vue'
import { depotFileToStorageAsset } from '@/composables/useDepot'

// The two depot sort columns, shared by the self and admin listings.
export type DepotFileSortCol = 'uploaded_at' | 'file_size'

export interface UseDepotFileTableOptions<T extends DepotFile> {
  // The listing call. Both the self (listFiles) and admin (adminListFiles)
  // endpoints fit; the admin-only params are ignored by the self endpoint.
  listFiles: (opts: AdminListFilesOptions) => Promise<DepotFilePage<T>>
  deleteFile: (objectKey: string) => Promise<void>
  perPage: Ref<number>
  // Bumped after a mutation so the page's KPI/quota cards refetch.
  refreshSignal: Ref<number>
  // Surfaced so the page can show the upload count (the self page binds this).
  total: Ref<number>
  // Extra listing params layered on top of limit/offset/sort/order/q, e.g. the
  // admin content-type and owner filters.
  extraParams?: () => Partial<AdminListFilesOptions>
  // Extra reactive sources that, like the search box, reset to page 1 and
  // refetch when they change (the admin filters).
  extraWatchSources?: WatchSource[]
  loadErrorMessage?: string
}

// Shared state and behavior behind the depot file tables: fetch, sort,
// pagination, row selection, the details drawer, and single/bulk delete. The
// self (Sharing) and admin (Depot) tables differ only in their toolbar,
// columns, and copy, so those live in the components; everything else is here.
export function useDepotFileTable<T extends DepotFile>(options: UseDepotFileTableOptions<T>) {
  const {
    listFiles,
    deleteFile,
    perPage,
    refreshSignal,
    total,
    extraParams,
    extraWatchSources = [],
    loadErrorMessage = 'Could not load uploads',
  } = options

  // ─── State ────────────────────────────────────────────────────────────────

  const loading = ref(false)
  const initialLoad = ref(true)
  const errorMessage = ref('')
  const files = ref<T[]>([]) as Ref<T[]>

  // Depot files mapped onto the shared StorageAsset shape so the grid view reuses
  // AssetGrid (lightbox, video, copy/open/download/delete).
  const gridAssets = computed(() => files.value.map(depotFileToStorageAsset))

  // Row selection for bulk actions. Depot sorts and paginates server-side, so
  // defineTable runs only for its selection helpers (pagination/sort stay off).
  const tableData = computed(() => files.value.map(file => ({
    id: file.object_key,
    _original: file,
  })))

  const { rows: tableRows, selectedRows, deselectAllRows } = defineTable(tableData, {
    pagination: { enabled: false },
    select: true,
  })

  const page = ref(1)
  const sortCol = ref<DepotFileSortCol>('uploaded_at')
  const sortDir = ref<'asc' | 'desc'>('desc')
  const search = ref('')

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  async function fetchFiles() {
    loading.value = true
    errorMessage.value = ''
    try {
      const { files: rows, total: count } = await listFiles({
        limit: perPage.value,
        offset: (page.value - 1) * perPage.value,
        sort: sortCol.value,
        order: sortDir.value,
        q: search.value || undefined,
        ...extraParams?.(),
      })
      files.value = rows
      total.value = count
    }
    catch (err) {
      errorMessage.value = err instanceof Error ? err.message : loadErrorMessage
      files.value = []
      total.value = 0
    }
    finally {
      loading.value = false
      initialLoad.value = false
    }
  }

  onBeforeMount(fetchFiles)

  // A new search or any extra filter resets to the first page; all refetch.
  watchDebounced([search, ...extraWatchSources], () => {
    page.value = 1
    void fetchFiles()
  }, { debounce: 300 })

  // ─── Pagination ───────────────────────────────────────────────────────────────

  const paginationState = computed(() => paginate(total.value, page.value, perPage.value))
  const shouldShowPagination = computed(() => total.value > perPage.value)

  function setPage(p: number) {
    page.value = p
    void fetchFiles()
  }

  // ─── Sorting ────────────────────────────────────────────────────────────────

  function handleSort(col: DepotFileSortCol) {
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

  function sortIcon(col: DepotFileSortCol): string {
    if (sortCol.value !== col)
      return 'ph:arrows-down-up'
    return sortDir.value === 'asc' ? 'ph:arrow-up' : 'ph:arrow-down'
  }

  // ─── Details drawer ───────────────────────────────────────────────────────────

  const selectedAsset = ref<StorageAsset | null>(null)
  // Kept alongside the mapped asset so the drawer can show the original file
  // (the admin table reads the uploader off it).
  const selectedFile = ref<T | null>(null) as Ref<T | null>
  const showDetailsDrawer = ref(false)

  function openDetails(file: T) {
    selectedFile.value = file
    selectedAsset.value = depotFileToStorageAsset(file)
    showDetailsDrawer.value = true
  }

  // AssetGrid emits the mapped StorageAsset on click; recover the original file
  // so a tile opens the same details drawer as a table row.
  function handleAssetClick(asset: StorageAsset) {
    const match = files.value.find(file => file.object_key === asset.path)
    if (match)
      openDetails(match)
  }

  watch(showDetailsDrawer, (open) => {
    if (!open) {
      selectedAsset.value = null
      selectedFile.value = null
    }
  })

  // ─── Delete ─────────────────────────────────────────────────────────────────

  const fileToDelete = ref<T | null>(null) as Ref<T | null>
  const deleting = ref(false)
  const showDeleteModal = computed({
    get: () => fileToDelete.value !== null,
    set: (open: boolean) => {
      if (!open)
        fileToDelete.value = null
    },
  })

  const showBulkDeleteModal = ref(false)
  const bulkDeleting = ref(false)

  async function confirmDelete() {
    const target = fileToDelete.value
    if (!target)
      return
    deleting.value = true
    try {
      await deleteFile(target.object_key)
      pushToast('Upload deleted')
      fileToDelete.value = null
      // Close the drawer if it was showing the file we just removed.
      if (selectedAsset.value?.path === target.object_key)
        showDetailsDrawer.value = false
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

  // AssetGrid and AssetDetails emit the mapped StorageAsset; its path is the
  // object key, so recover the original file to drive the delete confirmation.
  function handleAssetDelete(asset: StorageAsset) {
    const match = files.value.find(file => file.object_key === asset.path)
    if (match)
      fileToDelete.value = match
  }

  async function handleBulkDelete() {
    const targets = selectedRows.value.map(row => row._original)
    if (!targets.length)
      return
    bulkDeleting.value = true
    try {
      for (const file of targets)
        await deleteFile(file.object_key)

      pushToast(`Deleted ${targets.length} upload${targets.length === 1 ? '' : 's'}`)
      showBulkDeleteModal.value = false
      deselectAllRows()

      if (selectedAsset.value && targets.some(file => file.object_key === selectedAsset.value?.path))
        showDetailsDrawer.value = false

      // Stepping back avoids landing on an empty page when a full page is removed.
      if (targets.length >= files.value.length && page.value > 1)
        page.value -= 1
      await fetchFiles()
      refreshSignal.value++
    }
    catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not delete uploads')
    }
    finally {
      bulkDeleting.value = false
    }
  }

  // ─── External mutations ───────────────────────────────────────────────────────
  // Driven by the owning component after an action it owns (the Sharing table's
  // upload and wipe-all), so the table state stays consistent in one place.

  // After an upload: jump to the first page sorted newest-first, refetch, signal.
  async function handleUploaded() {
    page.value = 1
    sortCol.value = 'uploaded_at'
    sortDir.value = 'desc'
    await fetchFiles()
    refreshSignal.value++
  }

  // After an external bulk removal (wipe-all): clear selection, close the
  // drawer, reset to the first page, refetch, signal.
  async function handleExternalWipe() {
    deselectAllRows()
    showDetailsDrawer.value = false
    page.value = 1
    await fetchFiles()
    refreshSignal.value++
  }

  return {
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
  }
}
