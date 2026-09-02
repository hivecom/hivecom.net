import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useEffectiveRole } from '@/composables/useEffectiveRole'

export type MetricsAdminIrcChannel = Pick<Tables<'metrics_admin_irc_channels'>, 'id' | 'name' | 'secret'>

// Public metrics key secret (+s) IRC channels by the id from
// metrics_admin_irc_channels instead of the name. Only metrics_admin.read can
// select that table, so this lookup stays empty for everyone else and the
// charts fall back to a collapsed "secret channels" entry.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Module-level so every chart on a page shares one fetch.
const lookup = ref<Map<string, MetricsAdminIrcChannel>>(new Map())
let loaded = false
let inflight: Promise<void> | null = null

export function isOpaqueIrcChannelKey(key: string): boolean {
  return UUID_RE.test(key)
}

export function useMetricsAdminIrcChannels() {
  const supabase = useSupabaseClient<Database>()
  const { isAdmin } = useEffectiveRole()

  // RLS decides for real. The role check only avoids an empty round trip for
  // everyone who can't read the table anyway.
  async function load(force = false): Promise<void> {
    if (!isAdmin.value)
      return
    if (loaded && !force)
      return
    if (inflight)
      return inflight

    inflight = (async () => {
      const { data, error } = await supabase
        .from('metrics_admin_irc_channels')
        .select('id, name, secret')
      if (error !== null || data === null)
        return
      lookup.value = new Map(data.map(row => [row.id, row]))
      loaded = true
    })().finally(() => {
      inflight = null
    })
    return inflight
  }

  function resolve(key: string): MetricsAdminIrcChannel | null {
    return lookup.value.get(key) ?? null
  }

  return { lookup, isAdmin, load, resolve }
}
