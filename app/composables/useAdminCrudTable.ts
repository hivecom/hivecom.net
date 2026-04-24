import type { ComputedRef, Ref } from 'vue'
import { computed, inject, onBeforeMount, ref, watch } from 'vue'
import { useTableActions } from '@/composables/useTableActions'

const TRAILING_S_RE = /s$/

/**
 * Options for configuring the admin CRUD table composable.
 *
 * T = raw row type (e.g. Tables<'games'>)
 * R = display row type - the columns shown in the table (the composable merges _original automatically)
 */
export interface UseAdminCrudTableOptions<T extends { id: number }, R extends Record<string, unknown>> {
  /** Resource type string - drives permission checks and the URL query param key (e.g. 'games') */
  resourceType: string

  /** Fetches the raw data. Caller owns the Supabase query shape. */
  fetch: () => Promise<T[]>

  /** Maps a raw row to display columns. Do NOT include _original - the composable adds it. */
  transform: (item: T) => R

  /** Optional custom filter function. Receives raw item and current search string. Defaults to searching all transformed column values. */
  filterFn?: (item: T, search: string) => boolean

  /** Default sort column and direction */
  defaultSort?: { column: keyof R & string, direction: 'asc' | 'desc' }

  /**
   * If provided, enables URL query param deep-linking for the details sheet.
   * Defaults to resourceType with trailing 's' stripped (e.g. 'games' -> 'game').
   * Pass false to disable entirely.
   */
  queryParamKey?: string | false

  /**
   * Optional external ref to increment after each successful fetch (for driving KPI components).
   * Pass the ref returned by defineModel('refreshSignal') in the component.
   */
  refreshSignal?: Ref<number>
}

export type TransformedRow<T, R extends Record<string, unknown>> = R & { _original: T }

export interface UseAdminCrudTableReturn<T extends { id: number }, R extends Record<string, unknown>> {
  // Raw data
  items: Readonly<Ref<T[]>>
  loading: Readonly<Ref<boolean>>
  errorMessage: Ref<string>

  // Filtered + transformed rows fed into defineTable
  filteredRows: ComputedRef<TransformedRow<T, R>[]>

  // Count helpers
  totalCount: ComputedRef<number>
  filteredCount: ComputedRef<number>
  isFiltered: ComputedRef<boolean>

  // Search
  search: Ref<string>

  // Selection / sheet state
  selectedItem: Ref<T | null>
  showDetails: Ref<boolean>
  showForm: Ref<boolean>
  isEditMode: Ref<boolean>

  // Per-row action loading
  isActionLoading: (id: number, action: string) => boolean
  setActionLoading: (id: number, action: string, value: boolean) => void

  // Permissions
  canManageResource: ComputedRef<boolean>
  canCreate: ComputedRef<boolean>
  canUpdate: ComputedRef<boolean>
  canDelete: ComputedRef<boolean>

  // adminTablePerPage inject value
  adminTablePerPage: Ref<number>

  // Actions
  viewItem: (item: T) => void
  openAdd: () => void
  openEdit: (item: T, event?: Event) => void
  handleEditFromDetails: (item: T) => void
  refresh: () => Promise<void>
}

export function useAdminCrudTable<
  T extends { id: number },
  R extends Record<string, unknown>,
>(options: UseAdminCrudTableOptions<T, R>): UseAdminCrudTableReturn<T, R> {
  const {
    resourceType,
    fetch: fetchFn,
    transform,
    filterFn,
    defaultSort: _defaultSort,
    queryParamKey,
    refreshSignal,
  } = options

  // Resolve the URL param key. Strip trailing 's' by default (games -> game).
  const resolvedParamKey: string | false = queryParamKey === false
    ? false
    : (queryParamKey ?? resourceType.replace(TRAILING_S_RE, ''))

  // Permissions
  const { canManageResource, canCreate, canUpdate, canDelete } = useTableActions(resourceType)

  // Router (only used when deep-link is enabled)
  const route = resolvedParamKey !== false ? useRoute() : null
  const router = resolvedParamKey !== false ? useRouter() : null

  // Supabase client (available in composable via auto-import)
  // Not used directly here - the caller's fetch() handles the query.

  // Core state
  const items = ref<T[]>([]) as Ref<T[]>
  const loading = ref(true)
  const errorMessage = ref('')
  const search = ref('')

  // Sheet / form state
  const selectedItem = ref<T | null>(null) as Ref<T | null>
  const showDetails = ref(false)
  const showForm = ref(false)
  const isEditMode = ref(false)

  // Per-row action loading: { [id]: { [action]: boolean } }
  const actionLoadingMap = ref<Record<number, Record<string, boolean>>>({})

  function isActionLoading(id: number, action: string): boolean {
    return actionLoadingMap.value[id]?.[action] ?? false
  }

  function setActionLoading(id: number, action: string, value: boolean): void {
    actionLoadingMap.value[id] ??= {}
    actionLoadingMap.value[id][action] = value
  }

  // adminTablePerPage inject
  const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))

  // Default search filter: match against all display column string values
  function defaultFilterFn(item: T, term: string): boolean {
    const row = transform(item)
    return Object.values(row).some((v) => {
      if (v == null)
        return false
      return String(v).toLowerCase().includes(term)
    })
  }

  // Filtered + transformed rows
  const filteredRows = computed<TransformedRow<T, R>[]>(() => {
    const term = search.value.toLowerCase().trim()
    const source = term
      ? items.value.filter(item => (filterFn ?? defaultFilterFn)(item, term))
      : items.value

    return source.map(item => ({ ...transform(item), _original: item }))
  })

  const totalCount = computed(() => items.value.length)
  const filteredCount = computed(() => filteredRows.value.length)
  const isFiltered = computed(() => search.value.trim() !== '')

  // Fetch
  async function refresh(): Promise<void> {
    loading.value = true
    errorMessage.value = ''

    try {
      const data = await fetchFn()
      items.value = data

      if (refreshSignal != null) {
        refreshSignal.value = (refreshSignal.value || 0) + 1
      }
    }
    catch (err: unknown) {
      errorMessage.value = err instanceof Error ? err.message : `Failed to load ${resourceType}`
    }
    finally {
      loading.value = false
    }
  }

  // Selection actions
  function viewItem(item: T): void {
    selectedItem.value = item
    showDetails.value = true
  }

  function openAdd(): void {
    selectedItem.value = null
    isEditMode.value = false
    showForm.value = true
  }

  function openEdit(item: T, event?: Event): void {
    if (event)
      event.stopPropagation()
    selectedItem.value = item
    isEditMode.value = true
    showForm.value = true
  }

  function handleEditFromDetails(item: T): void {
    openEdit(item)
  }

  // URL param deep-linking
  if (resolvedParamKey !== false && route !== null && router !== null) {
    const focusedId = computed(() => {
      const raw = route.query[resolvedParamKey]
      const str = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
      const parsed = Number.parseInt(str, 10)
      return Number.isNaN(parsed) ? null : parsed
    })

    // Sync details sheet open/close -> URL
    watch(showDetails, (isOpen) => {
      if (isOpen && selectedItem.value) {
        void router.replace({ query: { ...route.query, [resolvedParamKey]: selectedItem.value.id } })
        return
      }
      if (isOpen)
        return
      if (route.query[resolvedParamKey] == null)
        return
      const rest = { ...route.query }
      delete rest[resolvedParamKey]
      void router.replace({ query: rest })
    })

    // On load: open details if URL has a matching param
    watch(
      () => [focusedId.value, loading.value] as const,
      ([id, isLoading]) => {
        if (isLoading || id === null)
          return
        const match = items.value.find(item => item.id === id)
        if (match)
          viewItem(match)
      },
      { immediate: true },
    )
  }

  onBeforeMount(refresh)

  return {
    items,
    loading,
    errorMessage,
    filteredRows,
    totalCount,
    filteredCount,
    isFiltered,
    search,
    selectedItem,
    showDetails,
    showForm,
    isEditMode,
    isActionLoading,
    setActionLoading,
    canManageResource,
    canCreate,
    canUpdate,
    canDelete,
    adminTablePerPage,
    viewItem,
    openAdd,
    openEdit,
    handleEditFromDetails,
    refresh,
  }
}
