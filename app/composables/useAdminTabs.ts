import type { ComputedRef, Ref } from 'vue'

export interface AdminTab<T extends string = string> {
  label: string
  value: T
}

/**
 * Encapsulates the permission-gated tab management + URL query-param sync
 * pattern shared across admin pages (network, users, etc.).
 *
 * The active tab is synced to/from the `?tab=` query param.
 *
 * Usage:
 *   const availableTabs = computed(() => [...])
 *   const { activeTab } = useAdminTabs(availableTabs)
 */
export function useAdminTabs<T extends string = string>(
  availableTabs: ComputedRef<AdminTab<T>[]>,
) {
  const route = useRoute()
  const router = useRouter()

  const activeTab = ref<T | ''>('')

  /**
   * Safely extracts a plain string from a route query value.
   */
  function readQueryTab(): string {
    const val = route.query.tab
    if (typeof val === 'string')
      return val
    if (Array.isArray(val) && typeof val[0] === 'string')
      return val[0]
    return ''
  }

  // When available tabs or the query param changes, pick the right active tab.
  watch(
    [availableTabs, () => route.query.tab] as const,
    ([tabs]) => {
      const queryValue = readQueryTab() as T

      // Honour the URL query param if it points at a permitted tab.
      if (queryValue.length > 0 && tabs.some(t => t.value === queryValue)) {
        activeTab.value = queryValue
        return
      }

      // Default to the first available tab if nothing is set yet.
      if (activeTab.value === '' && tabs.length > 0 && tabs[0]) {
        activeTab.value = tabs[0].value
      }
    },
    { immediate: true },
  )

  // Push the active tab to the URL ?tab= param whenever it changes.
  watch(activeTab, (tab) => {
    if (tab === '')
      return

    if (readQueryTab() === tab)
      return

    // eslint-disable-next-line ts/no-unsafe-assignment
    const query: Record<string, string | null | (string | null)[]> = { ...route.query, tab }
    void router.push({ query })
  })

  return {
    activeTab: activeTab as Ref<T | ''>,
  }
}
