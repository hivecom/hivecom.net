import type { Database } from '@/types/database.types'
import { ref } from 'vue'

export interface ResolvedNick {
  id: string
  username: string
}

// Module-level singletons - nick lookups persist for the session and are shared
// across all components that call useIrcNickResolver().
const _cache = new Map<string, ResolvedNick | null>()
const _pending = new Set<string>()
const _resolved = ref<Map<string, ResolvedNick | null>>(new Map())

export function useIrcNickResolver() {
  const supabase = useSupabaseClient<Database>()

  async function resolve(nicks: string[]) {
    if (!nicks.length)
      return

    const normalized = [...new Set(nicks.map(n => n.toLowerCase()).filter(Boolean))]

    // Sync any already-cached entries into the reactive ref immediately.
    let changed = false
    const next = new Map(_resolved.value)
    for (const n of normalized) {
      if (_cache.has(n) && !next.has(n)) {
        next.set(n, _cache.get(n) ?? null)
        changed = true
      }
    }
    if (changed)
      _resolved.value = next

    const toFetch = normalized.filter(n => !_cache.has(n) && !_pending.has(n))
    if (!toFetch.length)
      return

    toFetch.forEach(n => _pending.add(n))

    try {
      // Use ilike (no wildcards) for case-insensitive exact username matching.
      const orFilter = toFetch.map(n => `username.ilike.${n}`).join(',')
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username')
        .or(orFilter)

      if (error)
        throw error

      const found = new Map<string, ResolvedNick>()
      for (const p of (data ?? [])) {
        if (p.username)
          found.set(p.username.toLowerCase(), { id: p.id, username: p.username })
      }

      const final = new Map(_resolved.value)
      for (const nick of toFetch) {
        const entry = found.get(nick) ?? null
        _cache.set(nick, entry)
        final.set(nick, entry)
        _pending.delete(nick)
      }
      _resolved.value = final
    }
    catch {
      toFetch.forEach(n => _pending.delete(n))
    }
  }

  return { resolved: _resolved, resolve }
}
