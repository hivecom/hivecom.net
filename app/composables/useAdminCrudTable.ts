import type { ComputedRef, Ref } from 'vue'
import type { PermissionResource } from '@/types/database.overrides'
import { computed, inject, onBeforeMount, ref, watch } from 'vue'
import { useTableActions } from '@/composables/useTableActions'

const TRAILING_S_RE = /s$/

// T is the raw row, R the display columns. _original is merged into R here.
export interface UseAdminCrudTableOptions<T extends { id: number }, R extends Record<string, unknown>> {
  /** Also the default URL param key and the label in error messages. */
  resourceType: string

  /**
   * Defaults to resourceType. Set it when the permission group differs, e.g.
   * network_gameservers and network_servers both gate on 'network'.
   */
  permissionResource?: PermissionResource

  fetch: () => Promise<T[]>

  /** Leave _original out, it's added here. */
  transform: (item: T) => R

  /** Defaults to searching every transformed column. */
  filterFn?: (item: T, search: string) => boolean

  defaultSort?: { column: keyof R & string, direction: 'asc' | 'desc' }

  /**
   * Deep-link param for the details sheet. Defaults to resourceType without the
   * trailing 's' (games -> game). false disables it.
   */
  queryParamKey?: string | false

  /** Bumped after each successful fetch to drive KPI components. */
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
    permissionResource,
    fetch: fetchFn,
    transform,
    filterFn,
    defaultSort: _defaultSort,
    queryParamKey,
    refreshSignal,
  } = options

  const resolvedParamKey: string | false = queryParamKey === false
    ? false
    : (queryParamKey ?? resourceType.replace(TRAILING_S_RE, ''))

  const { canManageResource, canCreate, canUpdate, canDelete } = useTableActions(
    permissionResource ?? (resourceType as PermissionResource),
  )

  const route = resolvedParamKey !== false ? useRoute() : null
  const router = resolvedParamKey !== false ? useRouter() : null

  const items = ref<T[]>([]) as Ref<T[]>
  const loading = ref(true)
  const errorMessage = ref('')
  const search = ref('')

  const selectedItem = ref<T | null>(null) as Ref<T | null>
  const showDetails = ref(false)
  const showForm = ref(false)
  const isEditMode = ref(false)

  // { [id]: { [action]: boolean } }
  const actionLoadingMap = ref<Record<number, Record<string, boolean>>>({})

  function isActionLoading(id: number, action: string): boolean {
    return actionLoadingMap.value[id]?.[action] ?? false
  }

  function setActionLoading(id: number, action: string, value: boolean): void {
    actionLoadingMap.value[id] ??= {}
    actionLoadingMap.value[id][action] = value
  }

  const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))

  function defaultFilterFn(item: T, term: string): boolean {
    const row = transform(item)
    return Object.values(row).some((v) => {
      if (v == null)
        return false

      return String(v).toLowerCase().includes(term)
    })
  }

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

  if (resolvedParamKey !== false && route !== null && router !== null) {
    const focusedId = computed(() => {
      const raw = route.query[resolvedParamKey]
      const str = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
      const parsed = Number.parseInt(str, 10)
      return Number.isNaN(parsed) ? null : parsed
    })

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

    // Open the details sheet once the linked item has loaded.
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
