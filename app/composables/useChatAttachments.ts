import { pushToast } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import { useDepot } from '@/composables/useDepot'
import { useSharingRulesGate } from '@/composables/useSharingRulesGate'
import { useUserId } from '@/composables/useUserId'
import { forgetPendingMedia, listPendingMedia, rememberPendingMedia } from '@/lib/pendingMedia'

export type ChatAttachmentStatus = 'pending' | 'uploading' | 'done' | 'error'

export interface ChatAttachment {
  id: string
  file: File

  // Object URL for image previews, null for other files. Revoked on remove/clear.
  previewUrl: string | null
  status: ChatAttachmentStatus

  // Public Depot URL, set once the upload succeeds.
  url?: string
}

// Client-side sanity cap. Depot is the authority on the real limit; this just
// stops an obviously-too-big file from starting a doomed upload.
const MAX_FILE_BYTES = 100 * 1024 * 1024

// Module-level singleton. There's only ever one active composer, so sharing the
// trays is safe and lets a parent call add() from a drag handler.
// One tray per buffer, keyed like the composer's drafts, so files queued in one
// channel don't follow you into the next.
const trays = ref(new Map<string, ChatAttachment[]>())
const activeTray = ref('')
const uploading = ref(false)

const attachments = computed(() => trays.value.get(activeTray.value) ?? [])

// The trays are backed up to disk so a closed tab doesn't drop queued files.
// Attachment id -> its key in the pending media store, scoped to the user who
// queued it so a shared device never restores someone else's files.
const storageKeys = new Map<string, string>()

// User whose saved trays have already been loaded on this page.
let restoredFor: string | null = null

function storagePrefix(userId: string) {
  return `chat:${userId}:`
}

function trayFor(buffer: string): ChatAttachment[] {
  let tray = trays.value.get(buffer)
  if (!tray) {
    trays.value.set(buffer, [])
    tray = trays.value.get(buffer)!
  }

  return tray
}

export function useChatAttachments() {
  const depot = useDepot()
  const rulesGate = useSharingRulesGate()
  const userId = useUserId()

  function isImage(file: File) {
    return file.type.startsWith('image/')
  }

  function pushAttachment(buffer: string, id: string, file: File) {
    trayFor(buffer).push({
      id,
      file,
      previewUrl: isImage(file) ? URL.createObjectURL(file) : null,
      status: 'pending',
    })
  }

  function addToTray(files: File[]) {
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        pushToast('File too large', { description: `${file.name} is over 100 MB.` })
        continue
      }

      const id = crypto.randomUUID()
      pushAttachment(activeTray.value, id, file)

      if (userId.value != null) {
        const key = `${storagePrefix(userId.value)}${activeTray.value}:${id}`
        storageKeys.set(id, key)
        rememberPendingMedia(key, file)
      }
    }
  }

  function forgetStored(id: string) {
    const key = storageKeys.get(id)
    if (key === undefined)
      return

    forgetPendingMedia(key)
    storageKeys.delete(id)
  }

  // Put back whatever the user had queued when the page last closed, each file
  // into the tray of the buffer it was queued in. A file queued while this load
  // was running is already on disk too, so ids already in a tray are skipped.
  async function restore(id: string) {
    restoredFor = id

    const prefix = storagePrefix(id)
    const stored = await listPendingMedia(prefix)
    if (restoredFor !== id)
      return

    for (const { key, file } of stored) {
      // The id is a UUID and never holds a colon, so split on the last one in
      // case a buffer name does.
      const rest = key.slice(prefix.length)
      const split = rest.lastIndexOf(':')
      if (split === -1) {
        forgetPendingMedia(key)
        continue
      }

      const buffer = rest.slice(0, split)
      const attachmentId = rest.slice(split + 1)
      if (trayFor(buffer).some(a => a.id === attachmentId))
        continue

      storageKeys.set(attachmentId, key)
      pushAttachment(buffer, attachmentId, file)
    }
  }

  // Several components call this composable, so restoredFor keeps the load to
  // once per user per page.
  if (import.meta.client) {
    watch(userId, (id) => {
      if (id != null && id !== restoredFor)
        void restore(id)
    }, { immediate: true })
  }

  // Attaching uploads to Depot, so it goes through the sharing-rules gate.
  // Snapshot first since an <input>'s FileList is cleared right after this call.
  function add(files: FileList | File[]) {
    const snapshot = Array.from(files)
    if (!snapshot.length)
      return

    rulesGate.run(() => addToTray(snapshot))
  }

  // Call whenever the active buffer changes, alongside the draft text swap.
  function select(buffer: string) {
    activeTray.value = buffer
  }

  function remove(id: string) {
    const tray = trayFor(activeTray.value)
    const idx = tray.findIndex(a => a.id === id)
    if (idx === -1)
      return

    const [removed] = tray.splice(idx, 1)
    if (removed?.previewUrl)
      URL.revokeObjectURL(removed.previewUrl)

    forgetStored(id)
  }

  function clear() {
    for (const a of attachments.value) {
      if (a.previewUrl)
        URL.revokeObjectURL(a.previewUrl)

      forgetStored(a.id)
    }
    trays.value.delete(activeTray.value)
  }

  // Returns the public URLs in order, or null if any upload fails, leaving the
  // tray intact for a retry. Files done in a previous partial run aren't re-sent.
  async function uploadAll(): Promise<string[] | null> {
    if (!attachments.value.length)
      return []

    uploading.value = true
    try {
      const urls: string[] = []
      for (const att of attachments.value) {
        if (att.status === 'done' && att.url) {
          urls.push(att.url)
          continue
        }
        att.status = 'uploading'
        try {
          const res = await depot.uploadFile(att.file)
          att.status = 'done'
          att.url = res.url
          urls.push(res.url)
        }
        catch (error) {
          att.status = 'error'
          pushToast('Upload failed', {
            description: error instanceof Error ? error.message : `Could not upload ${att.file.name}.`,
          })
          return null
        }
      }
      return urls
    }
    finally {
      uploading.value = false
    }
  }

  return { attachments, uploading, select, add, remove, clear, uploadAll }
}
