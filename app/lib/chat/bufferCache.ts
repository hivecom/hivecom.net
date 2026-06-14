// ─────────────────────────────────────────────────────────────────────────────
// IndexedDB-backed cache for chat messages and buffer metadata (DB v2).
//
// Two object stores replace the old single-blob `buffers` store:
//   - `messages`   — per-message rows, compound key [bufferKey, msgid]
//   - `bufferMeta` — one row per open buffer, keyed by bufferKey string
//
// All public functions are best-effort: they catch errors and return empty
// values / void rather than throwing. This cache is a UX optimisation; losing
// it must never crash the app.
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = 'hivecom-chat'
const DB_VERSION = 2
const MSG_STORE = 'messages'
const META_STORE = 'bufferMeta'
const MSG_INDEX = 'by_buffer_ts'

// ── Exported interfaces ───────────────────────────────────────────────────────

export interface StoredMessage {
  bufferKey: string
  msgid: string
  ts: number
  type: 'chat' | 'tagmsg'
  from?: string
  channel?: string
  text: string
  replyTo?: string
  action?: boolean
  tag?: string
  /** Must be a plain object (not a Vue reactive proxy) before passing in. */
  reactions?: Record<string, string[]>
  redacted?: boolean
  relayedBy?: string
}

export interface StoredBufferMeta {
  key: string
  name: string
  kind: 'channel' | 'pm'
  topic?: string
}

// ── DB singleton ──────────────────────────────────────────────────────────────

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
      // Remove old v1 store if present
      if (db.objectStoreNames.contains('buffers'))
        db.deleteObjectStore('buffers')
      if (!db.objectStoreNames.contains(MSG_STORE)) {
        const msgs = db.createObjectStore(MSG_STORE, { keyPath: ['bufferKey', 'msgid'] })
        msgs.createIndex(MSG_INDEX, ['bufferKey', 'ts'], { unique: false })
      }
      if (!db.objectStoreNames.contains(META_STORE))
        db.createObjectStore(META_STORE, { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
  return dbPromise
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build the bufferKey string used as cache namespace for a given user+buffer. */
export function makeBufferKey(userKey: string, bufferName: string): string {
  return `${userKey}:${bufferName.toLowerCase()}`
}

// ── Messages ──────────────────────────────────────────────────────────────────

/** Batch-upsert messages. All in one IDB transaction. Mutations (same [bufferKey, msgid]) overwrite. Never throws. */
export async function upsertMessages(msgs: StoredMessage[]): Promise<void> {
  if (!msgs.length)
    return
  const db = await openDb()
  if (!db)
    return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(MSG_STORE, 'readwrite')
      const store = tx.objectStore(MSG_STORE)
      for (const msg of msgs)
        store.put(msg)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    }
    catch {
      resolve()
    }
  })
}

/**
 * Load the most recent `limit` messages for a buffer, in chronological order
 * (oldest first). Used for hydrating the live buffer on startup.
 */
export async function loadRecentMessages(
  userKey: string,
  bufferName: string,
  limit: number,
): Promise<StoredMessage[]> {
  const bufferKey = makeBufferKey(userKey, bufferName)
  const db = await openDb()
  if (!db)
    return []
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(MSG_STORE, 'readonly')
      const index = tx.objectStore(MSG_STORE).index(MSG_INDEX)
      const range = IDBKeyRange.bound(
        [bufferKey, 0],
        [bufferKey, Number.MAX_SAFE_INTEGER],
        false,
        false,
      )
      const results: StoredMessage[] = []
      const req = index.openCursor(range, 'prev')
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor || results.length >= limit) {
          results.reverse()
          resolve(results)
          return
        }
        results.push(cursor.value as StoredMessage)
        cursor.continue()
      }
      req.onerror = () => resolve([])
    }
    catch {
      resolve([])
    }
  })
}

/**
 * Load up to `limit` messages for a buffer with ts < beforeTs (exclusive),
 * newest-first then reversed to chronological. Used for cache-first scroll-back.
 */
export async function loadOlderMessages(
  userKey: string,
  bufferName: string,
  beforeTs: number,
  limit: number,
): Promise<StoredMessage[]> {
  const bufferKey = makeBufferKey(userKey, bufferName)
  const db = await openDb()
  if (!db)
    return []
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(MSG_STORE, 'readonly')
      const index = tx.objectStore(MSG_STORE).index(MSG_INDEX)
      const range = IDBKeyRange.bound(
        [bufferKey, 0],
        [bufferKey, beforeTs],
        false,
        true,
      )
      const results: StoredMessage[] = []
      const req = index.openCursor(range, 'prev')
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor || results.length >= limit) {
          results.reverse()
          resolve(results)
          return
        }
        results.push(cursor.value as StoredMessage)
        cursor.continue()
      }
      req.onerror = () => resolve([])
    }
    catch {
      resolve([])
    }
  })
}

/**
 * Load up to `limit` messages for a buffer with ts > afterTs (exclusive),
 * in chronological order (oldest first). Used for forward cache-loading.
 */
export async function loadNewerMessages(
  userKey: string,
  bufferName: string,
  afterTs: number,
  limit: number,
): Promise<StoredMessage[]> {
  const bufferKey = makeBufferKey(userKey, bufferName)
  const db = await openDb()
  if (!db)
    return []
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(MSG_STORE, 'readonly')
      const index = tx.objectStore(MSG_STORE).index(MSG_INDEX)
      const range = IDBKeyRange.bound(
        [bufferKey, afterTs],
        [bufferKey, Number.MAX_SAFE_INTEGER],
        true,
        false,
      )
      const results: StoredMessage[] = []
      const req = index.openCursor(range, 'next')
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor || results.length >= limit) {
          resolve(results)
          return
        }
        results.push(cursor.value as StoredMessage)
        cursor.continue()
      }
      req.onerror = () => resolve([])
    }
    catch {
      resolve([])
    }
  })
}

/** Delete all messages for a specific buffer (by bufferKey). Used when closing a buffer. */
export async function deleteBufferMessages(bufferKey: string): Promise<void> {
  const db = await openDb()
  if (!db)
    return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(MSG_STORE, 'readwrite')
      const store = tx.objectStore(MSG_STORE)
      const range = IDBKeyRange.bound([bufferKey, ''], [bufferKey, '\uFFFF'], false, false)
      const req = store.delete(range)
      req.onerror = () => resolve()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    }
    catch {
      resolve()
    }
  })
}

// ── Buffer metadata ───────────────────────────────────────────────────────────

/** Upsert buffer metadata. Never throws. */
export async function upsertBufferMeta(meta: StoredBufferMeta): Promise<void> {
  const db = await openDb()
  if (!db)
    return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(META_STORE, 'readwrite')
      tx.objectStore(META_STORE).put(meta)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    }
    catch {
      resolve()
    }
  })
}

/** Load all buffer metadata entries for a user. Used during hydration. */
export async function loadAllBufferMeta(userKey: string): Promise<StoredBufferMeta[]> {
  const db = await openDb()
  if (!db)
    return []
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(META_STORE, 'readonly')
      const range = IDBKeyRange.bound(`${userKey}:`, `${userKey}:\uFFFF`, false, false)
      const req = tx.objectStore(META_STORE).getAll(range)
      req.onsuccess = () => resolve((req.result as StoredBufferMeta[]) ?? [])
      req.onerror = () => resolve([])
    }
    catch {
      resolve([])
    }
  })
}

/** Delete a buffer's metadata entry. Call when a buffer is explicitly closed. */
export async function deleteBufferMeta(key: string): Promise<void> {
  const db = await openDb()
  if (!db)
    return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(META_STORE, 'readwrite')
      tx.objectStore(META_STORE).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    }
    catch {
      resolve()
    }
  })
}

// ── Buffer stats, pruning, export ───────────────────────────────────────────

/**
 * Count messages per buffer and estimate their storage size for a given user.
 * Returns one entry per bufferMeta row that has at least one message.
 * Size is estimated at 350 bytes per message (covers text, msgid, reactions, etc.).
 */
export async function getBufferStats(userKey: string): Promise<Array<{
  meta: StoredBufferMeta
  count: number
  estimatedBytes: number
  earliestTs: number | null
}>> {
  const metas = await loadAllBufferMeta(userKey)
  if (!metas.length)
    return []
  const db = await openDb()
  if (!db)
    return []

  const results: Array<{ meta: StoredBufferMeta, count: number, estimatedBytes: number, earliestTs: number | null }> = []
  for (const meta of metas) {
    const range = IDBKeyRange.bound([meta.key, 0], [meta.key, Number.MAX_SAFE_INTEGER])

    const count = await new Promise<number>((resolve) => {
      try {
        const tx = db.transaction(MSG_STORE, 'readonly')
        const index = tx.objectStore(MSG_STORE).index(MSG_INDEX)
        const req = index.count(range)
        req.onsuccess = () => resolve(req.result ?? 0)
        req.onerror = () => resolve(0)
      }
      catch { resolve(0) }
    })

    if (count === 0)
      continue

    const earliestTs = await new Promise<number | null>((resolve) => {
      try {
        const tx = db.transaction(MSG_STORE, 'readonly')
        const index = tx.objectStore(MSG_STORE).index(MSG_INDEX)
        const req = index.openCursor(range, 'next')
        req.onsuccess = () => {
          const cursor = req.result
          resolve(cursor ? (cursor.value as StoredMessage).ts : null)
        }
        req.onerror = () => resolve(null)
      }
      catch { resolve(null) }
    })

    results.push({ meta, count, estimatedBytes: count * 350, earliestTs })
  }
  return results
}

/**
 * Delete the oldest messages for a buffer, keeping at most `keepCount`.
 * No-op when the buffer already has fewer than keepCount messages.
 */
export async function pruneBuffer(bufferKey: string, keepCount: number): Promise<void> {
  const db = await openDb()
  if (!db)
    return
  const total = await new Promise<number>((resolve) => {
    try {
      const tx = db.transaction(MSG_STORE, 'readonly')
      const index = tx.objectStore(MSG_STORE).index(MSG_INDEX)
      const range = IDBKeyRange.bound([bufferKey, 0], [bufferKey, Number.MAX_SAFE_INTEGER])
      const req = index.count(range)
      req.onsuccess = () => resolve(req.result ?? 0)
      req.onerror = () => resolve(0)
    }
    catch { resolve(0) }
  })
  const toDelete = total - keepCount
  if (toDelete <= 0)
    return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(MSG_STORE, 'readwrite')
      const index = tx.objectStore(MSG_STORE).index(MSG_INDEX)
      const range = IDBKeyRange.bound([bufferKey, 0], [bufferKey, Number.MAX_SAFE_INTEGER])
      let deleted = 0
      const req = index.openCursor(range, 'next') // oldest first
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor || deleted >= toDelete) {
          resolve()
          return
        }
        cursor.delete()
        deleted++
        cursor.continue()
      }
      req.onerror = () => resolve()
      tx.oncomplete = () => resolve()
    }
    catch { resolve() }
  })
}

/**
 * Load ALL messages for a buffer in chronological order. Used for JSON export.
 * No limit - can be large; caller is responsible for download handling.
 */
export async function exportBufferMessages(bufferKey: string): Promise<StoredMessage[]> {
  const db = await openDb()
  if (!db)
    return []
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(MSG_STORE, 'readonly')
      const index = tx.objectStore(MSG_STORE).index(MSG_INDEX)
      const range = IDBKeyRange.bound([bufferKey, 0], [bufferKey, Number.MAX_SAFE_INTEGER])
      const results: StoredMessage[] = []
      const req = index.openCursor(range, 'next')
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) {
          resolve(results)
          return
        }
        results.push(cursor.value as StoredMessage)
        cursor.continue()
      }
      req.onerror = () => resolve([])
    }
    catch { resolve([]) }
  })
}

// ── Cache eviction ────────────────────────────────────────────────────────────

/** Clear all cached data for a user (sign-out). Pass no args to wipe everything. */
export async function clearChatCache(userKey?: string): Promise<void> {
  const db = await openDb()
  if (!db)
    return
  if (!userKey) {
    // Wipe both stores entirely
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([MSG_STORE, META_STORE], 'readwrite')
        tx.objectStore(MSG_STORE).clear()
        tx.objectStore(META_STORE).clear()
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
        tx.onabort = () => resolve()
      }
      catch {
        resolve()
      }
    })
  }
  // User-scoped clear: load all metas then delete messages + metas per buffer
  const metas = await loadAllBufferMeta(userKey)
  for (const m of metas) {
    await deleteBufferMessages(m.key)
    await deleteBufferMeta(m.key)
  }
}
