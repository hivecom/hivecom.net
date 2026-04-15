import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref, watch } from 'vue'

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
 */
export function useDataEventsPaged(pageSize: Ref<number>) {
  const supabase = useSupabaseClient<Database>()

  // ── Active events (ongoing + upcoming) ───────────────────────────────────

  const ongoingEvents = ref<Tables<'events'>[]>([])
  const upcomingEvents = ref<Tables<'events'>[]>([])
  const loadingActive = ref(false)
  const errorActive = ref<string | null>(null)

  async function fetchActive(): Promise<void> {
    loadingActive.value = true
    errorActive.value = null

    try {
      // Fetch all events that start in the future OR have started but not yet ended.
      // We pull a generous window: anything whose start is within the past 7 days
      // (to catch long-running events) or is in the future.
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .gte('date', sevenDaysAgo)
        .order('date', { ascending: true })

      if (error)
        throw error

      const events = data ?? []
      const nowDate = new Date()

      ongoingEvents.value = events.filter((event) => {
        const start = new Date(event.date)
        const end = event.duration_minutes != null
          ? new Date(start.getTime() + event.duration_minutes * 60 * 1000)
          : start
        return start <= nowDate && nowDate <= end
      })

      upcomingEvents.value = events.filter((event) => {
        const start = new Date(event.date)
        return start > nowDate
      })
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
    const now = new Date().toISOString()

    const { count, error } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .lt('date', now)

    if (!error && count != null && count !== 0)
      pastTotalCount.value = count
    else if (!error && count === 0)
      pastTotalCount.value = 0
  }

  async function fetchPast(page: number): Promise<void> {
    loadingPast.value = true
    errorPast.value = null

    try {
      const now = new Date().toISOString()
      const from = (page - 1) * pageSize.value
      const to = from + pageSize.value - 1

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .lt('date', now)
        .order('date', { ascending: false })
        .range(from, to)

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

  onMounted(() => {
    void fetchActive()
    void fetchPastCount()
    void fetchPast(pastPage.value)
  })

  // ── Derived ───────────────────────────────────────────────────────────────

  const loading = computed(() => loadingActive.value || loadingPast.value)
  const error = computed(() => errorActive.value ?? errorPast.value)

  return {
    // Active
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
