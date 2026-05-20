import type { Database } from '@/types/database.types'
import { onMounted, ref, watch } from 'vue'

// Module-level singleton so all consumers share one cache and one request
const currentPlayersBySteamId = ref<Map<number, string[]>>(new Map())
const presencesLoading = ref(false)
let fetched = false

export function useDataSteamPresences() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  async function fetchCurrentPlayers(): Promise<void> {
    presencesLoading.value = true
    const { data } = await supabase
      .from('presences_steam')
      .select('profile_id, current_app_id')
      .not('current_app_id', 'is', null)
    presencesLoading.value = false
    if (!data)
      return
    const map = new Map<number, string[]>()
    for (const row of data) {
      if (row.current_app_id == null)
        continue
      const existing = map.get(row.current_app_id) ?? []
      existing.push(row.profile_id)
      map.set(row.current_app_id, existing)
    }
    currentPlayersBySteamId.value = map
    fetched = true
  }

  function currentPlayersForSteamId(steamId: number | null | undefined): string[] {
    if (steamId == null)
      return []
    return currentPlayersBySteamId.value.get(steamId) ?? []
  }

  onMounted(() => {
    if (user.value && !fetched)
      void fetchCurrentPlayers()
  })

  watch(user, (u) => {
    if (u && !fetched)
      void fetchCurrentPlayers()
  })

  return {
    currentPlayersBySteamId,
    presencesLoading,
    fetchCurrentPlayers,
    currentPlayersForSteamId,
  }
}
