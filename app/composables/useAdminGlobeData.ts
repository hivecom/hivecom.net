// useAdminGlobeData.ts
// Fetches online user counts grouped by country for the admin globe visualization.
// Individual user lists are fetched on-demand (on hover) via fetchCountryUsers.

import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useSupabaseClient } from '#imports'

export interface CountryOnlineCount {
  country: string
  count: number
}

export function useAdminGlobeData() {
  const supabase = useSupabaseClient<Database>()
  const onlineCountsByCountry = ref<CountryOnlineCount[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Fetches count of online users per country (last 15 min).
  async function fetchOnlineUsers() {
    loading.value = true
    error.value = null

    try {
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('country')
        .not('country', 'is', null)
        .neq('country', '')
        .gt('last_seen', since)

      if (queryError)
        throw queryError

      const grouped = new Map<string, number>()
      for (const row of data ?? []) {
        const country = row.country
        if (country == null || country === '')
          continue
        grouped.set(country, (grouped.get(country) ?? 0) + 1)
      }

      onlineCountsByCountry.value = Array.from(grouped.entries())
        .map(([country, count]) => ({ country, count }))
        .sort((a, b) => b.count - a.count)
    }
    catch (err: unknown) {
      error.value = (err as Error).message
    }
    finally {
      loading.value = false
    }
  }

  // Fetches up to `limit` online users for a specific country on-demand.
  async function fetchCountryUsers(iso: string, limit = 10): Promise<{ userIds: string[], total: number }> {
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data, error: queryError } = await supabase
      .from('profiles')
      .select('id')
      .eq('country', iso)
      .gt('last_seen', since)
      .order('username', { ascending: true })
      .limit(limit)

    if (queryError)
      throw queryError

    // total comes from the already-fetched count map
    const total = onlineCountsByCountry.value.find(e => e.country === iso)?.count ?? (data?.length ?? 0)
    return { userIds: (data ?? []).map(r => r.id), total }
  }

  // Fetches up to `limit` users for a specific country (all users, not just online).
  async function fetchCountryAllUsers(iso: string, limit = 10): Promise<{ userIds: string[], total: number }> {
    const { data, error: queryError } = await supabase
      .from('profiles')
      .select('id')
      .eq('country', iso)
      .order('username', { ascending: true })
      .limit(limit)

    if (queryError)
      throw queryError

    return { userIds: (data ?? []).map(r => r.id), total: 0 }
  }

  return {
    onlineCountsByCountry,
    loading,
    error,
    fetchOnlineUsers,
    fetchCountryUsers,
    fetchCountryAllUsers,
  }
}
