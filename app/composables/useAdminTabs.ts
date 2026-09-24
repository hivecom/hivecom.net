import type { ComputedRef, Ref } from 'vue'

export interface AdminTab<T extends string = string> {
  label: string
  value: T
}

/** Permission-gated admin tabs, with the active tab synced to and from `?tab=`. */
export function useAdminTabs<T extends string = string>(
  availableTabs: ComputedRef<AdminTab<T>[]>,
) {
  const route = useRoute()
  const router = useRouter()

  const activeTab = ref<T | ''>('')

  function readQueryTab(): string {
    const val = route.query.tab
    if (typeof val === 'string')
      return val
    if (Array.isArray(val) && typeof val[0] === 'string')
      return val[0]

    return ''
  }

  watch(
    [availableTabs, () => route.query.tab] as const,
    ([tabs]) => {
      const queryValue = readQueryTab() as T

      // Only honour ?tab= when it points at a tab this user is permitted to see.
      if (queryValue.length > 0 && tabs.some(t => t.value === queryValue)) {
        activeTab.value = queryValue
        return
      }

      if (activeTab.value === '' && tabs.length > 0 && tabs[0]) {
        activeTab.value = tabs[0].value
      }
    },
    { immediate: true },
  )

  watch(activeTab, (rawTab) => {
    const tab: T | '' = rawTab as T | ''
    if (tab === '')
      return

    if (readQueryTab() === tab)
      return

    const safeQuery = route.query as Record<string, string | null | string[]>
    void router.push({ query: { ...safeQuery, tab } })
  })

  return {
    activeTab: activeTab as Ref<T | ''>,
  }
}
