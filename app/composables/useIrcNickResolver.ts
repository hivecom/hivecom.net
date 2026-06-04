import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useCache } from '@/composables/useCache'

export interface ResolvedNick {
  id: string
  username: string
}

const NICK_TTL = 5 * 60 * 1000 // 5 minutes

// Module-level singletons - reactive state and in-flight dedup are shared
// across all components that call useIrcNickResolver().
const _pending = new Set<string>()
const _resolved = ref<Map<string, ResolvedNick | null>>(new Map())

export function useIrcNickResolver() {
  const supabase = useSupabaseClient<Database>()
  // Per-instance cache handle; all instances share the same localStorage keys.
  const cache = useCache({ storagePrefix: 'hivecom:cache:irc:' })

  async function resolve(nicks: string[]) {
    if (!nicks.length)
      return

    const normalized = [...new Set(nicks.map(n => n.toLowerCase()).filter(Boolean))]

    // Seed from localStorage cache before hitting the network.
    let changed = false
    const next = new Map(_resolved.value)
    for (const n of normalized) {
      if (!next.has(n) && cache.has(`nick:${n}`)) {
        next.set(n, cache.get<ResolvedNick>(`nick:${n}`))
        changed = true
      }
    }
    if (changed)
      _resolved.value = next

    const toFetch = normalized.filter(n => !_resolved.value.has(n) && !_pending.has(n))
    if (!toFetch.length)
      return

    toFetch.forEach(n => _pending.add(n))

    try {
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
        // Persist result (including null misses) so subsequent page loads skip
        // the network round-trip.
        cache.set(`nick:${nick}`, entry, NICK_TTL)
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
