import type { SupabaseClient } from '@supabase/supabase-js'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref, watch } from 'vue'
import { useCache } from '@/composables/useCache'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'
import { expandRecurringEvent } from '@/lib/utils/rrule'

// Shares the events namespace so invalidateEventsCache() also busts paged results.
const _pagedEventsCache = useCache(CACHE_NAMESPACES.events)

// RPCs with a no-arg overload first in the union make TypeScript reject the
// args object. This cast avoids `any`.
async function rpc<T>(
  client: SupabaseClient<Database>,
  fn: string,
  args: Record<string, unknown>,
) {
  return (client.rpc as (fn: string, args: Record<string, unknown>) => ReturnType<SupabaseClient<Database>['rpc']>)(fn, args) as ReturnType<SupabaseClient<Database>['rpc']> & Promise<{ data: T | null, error: unknown }>
}

/**
 * Past events are paginated server-side with the filters passed to the RPCs.
 * Ongoing and upcoming are too few to paginate, so they come from one fetch and
 * are filtered client-side.
 */
export function useDataEventsPaged(
  pageSize: Ref<number>,
  search?: Ref<string>,
  officialFilter?: Ref<boolean | null>,
  recurringFilter?: Ref<boolean | null>,
  gameFilter?: Ref<number[]>,
) {
  const supabase = useSupabaseClient<Database>()

  // ── Cache key helpers ─────────────────────────────────────────────────────

  function activeKey(): string {
    return 'events:active-paged:v1'
  }

  function pastKey(page: number): string {
    const s = (search?.value ?? '').trim()
    const f = String(officialFilter?.value ?? '')
    const r = String(recurringFilter?.value ?? '')
    const g = (gameFilter?.value ?? []).join(',')
    return `events:past:p${page}:n${pageSize.value}:f${f}:r${r}:g${g}:s${s}`
  }

  function countKey(): string {
    const s = (search?.value ?? '').trim()
    const f = String(officialFilter?.value ?? '')
    const r = String(recurringFilter?.value ?? '')
    const g = (gameFilter?.value ?? []).join(',')
    return `events:past-count:f${f}:r${r}:g${g}:s${s}`
  }

  // ── Active events (ongoing + upcoming) ───────────────────────────────────

  const _allActiveEvents = ref<Tables<'events'>[]>([])
  const loadingActive = ref(false)
  const errorActive = ref<string | null>(null)

  const ongoingEvents = computed(() => {
    const now = new Date()
    return _allActiveEvents.value
      .filter((event) => {
        const start = new Date(event.date)
        const end = event.duration_minutes != null
          ? new Date(start.getTime() + event.duration_minutes * 60 * 1000)
          : start
        return start <= now && now <= end
      })
      .filter(event => applyFilters(event))
  })

  const upcomingEvents = computed(() => {
    const now = new Date()
    return _allActiveEvents.value
      .filter(event => new Date(event.date) > now)
      .filter(event => applyFilters(event))
  })

  function applyFilters(event: Tables<'events'>): boolean {
    const q = search?.value.trim().toLowerCase() ?? ''
    if (q) {
      const inTitle = event.title.toLowerCase().includes(q)
      const inDescription = event.description.toLowerCase().includes(q)
      if (!inTitle && !inDescription)
        return false
    }
    if (officialFilter?.value != null && event.is_official !== officialFilter.value)
      return false
    if (recurringFilter?.value === true && event.recurrence_rule != null)
      return false

    const ids = gameFilter?.value ?? []
    if (ids.length > 0 && !(event.games ?? []).some(id => ids.includes(id)))
      return false

    return true
  }

  async function fetchActive(): Promise<void> {
    const key = activeKey()
    const cached = _pagedEventsCache.get<Tables<'events'>[]>(key)
    if (cached !== null) {
      _allActiveEvents.value = cached
      return
    }

    loadingActive.value = true
    errorActive.value = null

    try {
      const nowDate = new Date()
      const sevenDaysAgo = new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000)
      const oneYearAhead = new Date(nowDate.getTime() + 365 * 24 * 60 * 60 * 1000)
      const sevenDaysAgoIso = sevenDaysAgo.toISOString()

      const [inWindowResult, recurringResult] = await Promise.all([
        supabase
          .from('events')
          .select('*')
          .gte('date', sevenDaysAgoIso)
          .is('recurrence_rule', null)
          .order('date', { ascending: true }),
        supabase
          .from('events')
          .select('*')
          .not('recurrence_rule', 'is', null)
          .order('date', { ascending: true }),
      ])

      if (inWindowResult.error)
        throw inWindowResult.error
      if (recurringResult.error)
        throw recurringResult.error

      const seen = new Set<number>()
      const merged: Tables<'events'>[] = []
      for (const row of [...(inWindowResult.data ?? []), ...(recurringResult.data ?? [])]) {
        if (!seen.has(row.id)) {
          seen.add(row.id)
          merged.push(row)
        }
      }

      const expanded: Tables<'events'>[] = merged.flatMap(event =>
        expandRecurringEvent(event, sevenDaysAgo, oneYearAhead),
      )

      const filtered = expanded.filter(event => new Date(event.date) >= sevenDaysAgo)
      _allActiveEvents.value = filtered
      _pagedEventsCache.set(key, filtered)
    }
    catch (err) {
      errorActive.value = err instanceof Error ? err.message : 'Failed to fetch events'
    }
    finally {
      loadingActive.value = false
    }
  }

  // ── Past events (paginated) ───────────────────────────────────────────────

  const pastEvents = ref<Tables<'events'>[]>([])
  const pastTotalCount = ref(0)
  const pastPage = ref(1)
  const loadingPast = ref(false)
  const errorPast = ref<string | null>(null)

  async function fetchPastCount(): Promise<void> {
    const key = countKey()
    const cached = _pagedEventsCache.get<number>(key)
    if (cached !== null) {
      pastTotalCount.value = cached
      return
    }

    const ids = gameFilter?.value ?? []

    const { data, error } = await rpc<number>(supabase, 'get_past_events_count', {
      p_search: search?.value.trim() !== '' ? search?.value.trim() : null,
      p_is_official: officialFilter?.value ?? null,
      p_hide_recurring: recurringFilter?.value === true,
      p_game_ids: ids.length > 0 ? ids : null,
    })

    if (!error && data != null) {
      pastTotalCount.value = Number(data)
      _pagedEventsCache.set(key, Number(data))
    }
  }

  async function fetchPast(page: number): Promise<void> {
    const key = pastKey(page)
    const cached = _pagedEventsCache.get<Tables<'events'>[]>(key)
    if (cached !== null) {
      pastEvents.value = cached
      return
    }

    loadingPast.value = true
    errorPast.value = null

    try {
      const ids = gameFilter?.value ?? []
      const from = (page - 1) * pageSize.value

      const { data, error } = await rpc<Tables<'events'>[]>(supabase, 'get_past_events_paginated', {
        p_limit: pageSize.value,
        p_offset: from,
        p_search: search?.value.trim() !== '' ? search?.value.trim() : null,
        p_is_official: officialFilter?.value ?? null,
        p_hide_recurring: recurringFilter?.value === true,
        p_game_ids: ids.length > 0 ? ids : null,
      })

      if (error)
        throw error

      const rows: Tables<'events'>[] = data ?? []
      pastEvents.value = rows
      _pagedEventsCache.set(key, rows)
    }
    catch (err) {
      errorPast.value = err instanceof Error ? err.message : 'Failed to fetch past events'
    }
    finally {
      loadingPast.value = false
    }
  }

  function setPage(page: number): void {
    pastPage.value = page
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  watch(pastPage, (page) => {
    void fetchPast(page)
  })

  watch(pageSize, () => {
    pastPage.value = 1
    void fetchPastCount()
    void fetchPast(1)
  })

  if (search) {
    watchDebounced(search, () => {
      pastPage.value = 1
      void fetchPastCount()
      void fetchPast(1)
    }, { debounce: 300 })
  }

  if (officialFilter) {
    watch(officialFilter, () => {
      pastPage.value = 1
      void fetchPastCount()
      void fetchPast(1)
    })
  }

  if (recurringFilter) {
    watch(recurringFilter, () => {
      pastPage.value = 1
      void fetchPastCount()
      void fetchPast(1)
    })
  }

  if (gameFilter) {
    watch(gameFilter, () => {
      pastPage.value = 1
      void fetchPastCount()
      void fetchPast(1)
    })
  }

  onMounted(() => {
    void fetchActive()
    void fetchPastCount()
    void fetchPast(pastPage.value)
  })

  // ── Derived ───────────────────────────────────────────────────────────────

  const loading = computed(() => loadingActive.value || loadingPast.value)
  const error = computed(() => errorActive.value ?? errorPast.value)

  return {
    ongoingEvents,
    upcomingEvents,
    loadingActive,

    pastEvents,
    pastTotalCount,
    pastPage,
    loadingPast,

    loading,
    error,

    setPage,
    refreshActive: fetchActive,
    refreshPast: async () => fetchPast(pastPage.value),
  }
}
