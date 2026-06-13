// ─────────────────────────────────────────────────────────────────────────────
// IndexedDB-backed cache for chat buffers.
//
// localStorage is the wrong place for bulk message history: it's synchronous
// (every write blocks the main thread) and capped at ~5 MB. IndexedDB is async
// and has a far larger quota, so it's where we offload the (potentially large)
// per-buffer message snapshots used to paint the chat UI instantly on load.
//
// This module is intentionally decoupled from the IRC composable: it knows only
// about its own plain cached shapes, so the composable maps to/from its richer
// `ChatBuffer`/`ChatMessage` types. The store is keyed per identity (nick) so a
// signed-out load never surfaces a previous user's conversations.
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = 'hivecom-chat'
const DB_VERSION = 1
const STORE = 'buffers'

/**
 * A single persisted chat line. Dates are stored as epoch ms for a stable,
 * version-independent shape. Transient/noise lines (join/part/system) and
 * redacted messages are never persisted.
 */
export interface CachedChatMessage {
  ts: number
  type: 'chat' | 'tagmsg'
  from?: string
  channel?: string
  text: string
  msgid?: string
  replyTo?: string
  action?: boolean
  tag?: string
  reactions?: Record<string, string[]>
}

/**
 * A persisted channel/DM buffer. Presence (users), modes and metadata are
 * deliberately omitted - they're transient and repopulate live on connect.
 */
export interface CachedChatBuffer {
  name: string
  kind: 'channel' | 'pm'
  topic?: string
  readLineTs?: number
  messages: CachedChatMessage[]
}

interface CacheRecord {
  nick: string
  savedAt: number
  buffers: CachedChatBuffer[]
}

let dbPromise: Promise<IDBDatabase | null> | null = null

async function openDb(): Promise<IDBDatabase | null> {
  if (!import.meta.client || typeof indexedDB === 'undefined')
    return null
  if (dbPromise)
    return dbPromise
  dbPromise = new Promise((resolve) => {
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    }
    catch {
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: 'nick' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
  return dbPromise
}

/**
 * Load the cached buffers for a nick, or null when nothing is stored / IDB is
 * unavailable. Never throws - the cache is a best-effort UX optimisation.
 */
export async function loadChatBufferCache(nick: string): Promise<CachedChatBuffer[] | null> {
  const key = nick.trim().toLowerCase()
  if (!key)
    return null
  const db = await openDb()
  if (!db)
    return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => {
        const rec = req.result as CacheRecord | undefined
        resolve(rec?.buffers ?? null)
      }
      req.onerror = () => resolve(null)
    }
    catch {
      resolve(null)
    }
  })
}

/** Persist (or, when empty, delete) the cached buffers for a nick. Never throws. */
export async function saveChatBufferCache(nick: string, buffers: CachedChatBuffer[]): Promise<void> {
  const key = nick.trim().toLowerCase()
  if (!key)
    return
  const db = await openDb()
  if (!db)
    return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      if (buffers.length === 0)
        store.delete(key)
      else
        store.put({ nick: key, savedAt: Date.now(), buffers } satisfies CacheRecord)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    }
    catch {
      resolve()
    }
  })
}

/** Drop a single nick's cache, or the entire store when no nick is given. */
export async function clearChatBufferCache(nick?: string): Promise<void> {
  const db = await openDb()
  if (!db)
    return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      if (nick)
        store.delete(nick.trim().toLowerCase())
      else
        store.clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    }
    catch {
      resolve()
    }
  })
}
