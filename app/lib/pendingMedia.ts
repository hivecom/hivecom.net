// ─────────────────────────────────────────────────────────────────────────────
// Backing store for composer files that haven't been uploaded yet, so a
// closed tab doesn't take them with it. Keys are the caller's to pick:
//
//   - the rich text editor keeps pasted media as blob: URLs until submit, and
//     keys each file by its URL. The markdown carrying those URLs outlives
//     them (a restored reply draft, the fullscreen editor, a plain-text round
//     trip), and the file here lets the editor pick the media back up.
//   - the chat composer keys its attachment tray by `chat:<userId>:<id>` and
//     lists the prefix to rebuild the tray on load.
//
// Files live in memory while the page does and in IndexedDB across reloads,
// pruned after DRAFT_TTL.
//
// All public functions are best-effort and never throw. Losing a file here
// costs the user one image, and must never break writing the post itself.
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = 'hivecom-pending-media'
const DB_VERSION = 1
const STORE = 'pendingMedia'

// Matches the reply draft TTL in useReplyDraft, since a file is only useful
// while some draft or tray still points at it.
const DRAFT_TTL = 30 * 24 * 60 * 60 * 1000

interface StoredPendingMedia {
  key: string
  file: File
  updatedAt: number
}

const live = new Map<string, File>()

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
      if (!req.result.objectStoreNames.contains(STORE))
        req.result.createObjectStore(STORE, { keyPath: 'key' })
    }
    req.onsuccess = () => {
      void prune(req.result)
      resolve(req.result)
    }
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })

  return dbPromise
}

async function run(db: IDBDatabase, mode: IDBTransactionMode, work: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode)
      work(tx.objectStore(STORE))
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    }
    catch {
      resolve()
    }
  })
}

// Drop files no draft can still reference. Runs once per page load.
async function prune(db: IDBDatabase): Promise<void> {
  const cutoff = Date.now() - DRAFT_TTL

  return run(db, 'readwrite', (store) => {
    const cursorReq = store.openCursor()
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result
      if (!cursor)
        return

      const row = cursor.value as Partial<StoredPendingMedia>
      if (typeof row.updatedAt !== 'number' || row.updatedAt < cutoff)
        cursor.delete()

      cursor.continue()
    }
  })
}

async function write(work: (store: IDBObjectStore) => void): Promise<void> {
  const db = await openDb()
  if (db)
    await run(db, 'readwrite', work)
}

// Files remembered in the same millisecond still get distinct stamps, so
// listPendingMedia keeps them in arrival order.
let lastStamp = 0

/** Remember a pending file, in memory and on disk. */
export function rememberPendingMedia(key: string, file: File): void {
  live.set(key, file)

  lastStamp = Math.max(Date.now(), lastStamp + 1)
  const updatedAt = lastStamp
  void write(store => store.put({ key, file, updatedAt } satisfies StoredPendingMedia))
}

/** Forget a file once it's uploaded, replaced, or removed. */
export function forgetPendingMedia(key: string): void {
  live.delete(key)
  void write(store => store.delete(key))
}

/** Pending file remembered earlier on this page. */
export function livePendingMedia(key: string): File | null {
  return live.get(key) ?? null
}

/** Pending file from any page load, including ones before this one. */
export async function loadPendingMedia(key: string): Promise<File | null> {
  const db = await openDb()
  if (!db)
    return null

  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      req.onsuccess = () => {
        const row = req.result as Partial<StoredPendingMedia> | undefined
        resolve(row?.file instanceof Blob ? row.file : null)
      }
      req.onerror = () => resolve(null)
    }
    catch {
      resolve(null)
    }
  })
}

/** Every pending file whose key starts with prefix, oldest first. */
export async function listPendingMedia(prefix: string): Promise<Array<{ key: string, file: File }>> {
  const db = await openDb()
  if (!db)
    return []

  return new Promise((resolve) => {
    try {
      // '\uFFFF' sorts after any character a key can hold, so this range
      // covers exactly the keys under prefix.
      const range = IDBKeyRange.bound(prefix, `${prefix}\uFFFF`)
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll(range)
      req.onsuccess = () => {
        const rows = (req.result as Array<Partial<StoredPendingMedia>>)
          .filter((row): row is StoredPendingMedia => typeof row.key === 'string' && row.file instanceof Blob && typeof row.updatedAt === 'number')
          .sort((a, b) => a.updatedAt - b.updatedAt)

        resolve(rows.map(({ key, file }) => ({ key, file })))
      }
      req.onerror = () => resolve([])
    }
    catch {
      resolve([])
    }
  })
}
