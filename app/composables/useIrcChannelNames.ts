import type { MetricsAdminIrcChannel } from '@/composables/useMetricsAdminIrcChannels'
import { ref } from 'vue'
import { useMetricsAdminIrcChannels } from '@/composables/useMetricsAdminIrcChannels'
import { metricsChannelKey } from '@/lib/chat/metricsChannelKey'

export interface IrcChannelName {
  name: string
  secret: boolean
}

// Secret (+s) channels are keyed in public metrics by a hash of their name
// rather than by the name, so the numbers are readable while the name is not.
// Anyone who already knows a name can recompute its key, which is what lets a
// member label their own channels with nothing disclosed server-side.
//
// The names come from this browser: every channel we land in is remembered
// here. That has to outlive the chat socket, since the dashboard renders long
// before anyone opens chat and usually while it is closed entirely.
const STORAGE_CHANNELS = 'hivecom.chat.metrics-channels'

// Covers any realistic channel list several times over without letting a
// long-lived browser accumulate without bound.
const MAX_REMEMBERED = 200

const names = ref<string[]>([])
const keyed = ref<Map<string, string>>(new Map())
let hydrated = false

function readStored(): string[] {
  if (!import.meta.client)
    return []

  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_CHANNELS) ?? '[]') as unknown

    return Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === 'string') : []
  }
  catch {
    return []
  }
}

function hydrate(): void {
  if (hydrated)
    return

  names.value = readStored()
  hydrated = true
}

function persist(): void {
  if (!import.meta.client)
    return

  localStorage.setItem(STORAGE_CHANNELS, JSON.stringify(names.value))
}

// Rederives every remembered name. Cheap to redo wholesale because the helper
// memoises, so only names it hasn't seen before actually get hashed.
async function rebuild(): Promise<void> {
  const entries = await Promise.all(
    names.value.map(async name => [await metricsChannelKey(name), name] as const),
  )

  keyed.value = new Map(entries)
}

/**
 * Remember a channel this browser is in, so its metrics row can be labelled.
 *
 * Called from the IRC client on our own JOIN, which happens outside any
 * component setup, so this deliberately touches nothing needing Nuxt context.
 */
export function rememberIrcChannel(name: string): void {
  const channel = name.trim()
  if (!channel.startsWith('#'))
    return

  hydrate()

  const lower = channel.toLowerCase()
  if (names.value.some(known => known.toLowerCase() === lower))
    return

  names.value = [...names.value, channel].slice(-MAX_REMEMBERED)

  persist()
  void rebuild()
}

export function useIrcChannelNames() {
  const { isAdmin, load: loadAdmin, resolve: resolveAdmin } = useMetricsAdminIrcChannels()

  // Nothing here may resolve during SSR or the hydrating render: these names
  // live in localStorage, which the server never saw, so labelling a row on
  // first paint would be markup the server never sent. Hashing is async, so the
  // map only ever lands a tick later and Vue patches the DOM normally.
  async function load(): Promise<void> {
    // No-ops for anyone without metrics_admin.read.
    await loadAdmin()

    hydrate()
    await rebuild()
  }

  // A channel we're in answers before the admin table does. Same answer, and it
  // holds for admins who have since left a channel they still have a row for.
  function resolve(key: string): IrcChannelName | null {
    const mine = keyed.value.get(key)
    if (mine !== undefined)
      return { name: mine, secret: true }

    const row: MetricsAdminIrcChannel | null = resolveAdmin(key)
    if (row !== null)
      return { name: row.name, secret: row.secret }

    return null
  }

  return { load, resolve, isAdmin }
}
