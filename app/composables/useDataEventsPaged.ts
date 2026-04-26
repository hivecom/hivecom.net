import type { SupabaseClient } from '@supabase/supabase-js'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref, watch } from 'vue'
import { expandRecurringEvent } from '@/lib/utils/rrule'

// Typed helper to call RPCs that have a no-arg overload first in the union,
// which causes TypeScript to reject the args object. This avoids `any`.
async function rpc<T>(
  client: SupabaseClient<Database>,
  fn: string,
  args: Record<string, unknown>,
) {
  return (client.rpc as (fn: string, args: Record<string, unknown>) => ReturnType<SupabaseClient<Database>['rpc']>)(fn, args) as ReturnType<SupabaseClient<Database>['rpc']> & Promise<{ data: T | null, error: unknown }>
}

/**
 * Server-side paginated events composable for the listing view.
 *
 * Splits events into three buckets using separate queries:
 * - `ongoingEvents`  – events whose window straddles now (start <= now <= end)
 * - `upcomingEvents` – events that haven't started yet (start > now)
 * - `pastEvents`     – events that have fully ended (end < now), paginated server-side
 *
 * Past events are fetched one page at a time via `limit`/`range` so we never
 * pull the full history. A lightweight `count` query runs once (and again after
 * any page change) to keep `pastTotalCount` accurate for the pagination control.
 *
 * Ongoing and upcoming are fetched together in a single query - there will never
 * be enough of them to warrant pagination.
 *
 * Optional `search` and `officialFilter` refs are respected by all three buckets:
 * - Active/upcoming: filtered client-side after fetch
 * - Past: passed as params to the server-side RPCs
 */
export function useDataEventsPaged(
  pageSize: Ref<number>,
  search?: Ref<string>,
  officialFilter?: Ref<boolean | null>,
) {
  const supabase = useSupabaseClient<Database>()

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
    return true
  }

  async function fetchActive(): Promise<void> {
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

      _allActiveEvents.value = expanded.filter(event => new Date(event.date) >= sevenDaysAgo)
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
    const { data, error } = await rpc<number>(supabase, 'get_past_events_count', {
      p_search: search?.value.trim() !== '' ? search?.value.trim() : null,
      p_is_official: officialFilter?.value ?? null,
    })

    if (!error && data != null)
      pastTotalCount.value = Number(data)
  }

  async function fetchPast(page: number): Promise<void> {
    loadingPast.value = true
    errorPast.value = null

    try {
      const from = (page - 1) * pageSize.value

      const { data, error } = await rpc<Tables<'events'>[]>(supabase, 'get_past_events_paginated', {
        p_limit: pageSize.value,
        p_offset: from,
        p_search: search?.value.trim() !== '' ? search?.value.trim() : null,
        p_is_official: officialFilter?.value ?? null,
      })

      if (error)
        throw error

      pastEvents.value = data ?? []
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

  // Re-fetch past when filters change; reset to page 1
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

  onMounted(() => {
    void fetchActive()
    void fetchPastCount()
    void fetchPast(pastPage.value)
  })

  // ── Derived ───────────────────────────────────────────────────────────────

  const loading = computed(() => loadingActive.value || loadingPast.value)
  const error = computed(() => errorActive.value ?? errorPast.value)

  return {
    // Active (computed, filtered)
    ongoingEvents,
    upcomingEvents,
    loadingActive,

    // Past
    pastEvents,
    pastTotalCount,
    pastPage,
    loadingPast,

    // Combined
    loading,
    error,

    // Actions
    setPage,
    refreshActive: fetchActive,
    refreshPast: async () => fetchPast(pastPage.value),
  }
}
