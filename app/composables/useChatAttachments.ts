import { pushToast } from '@dolanske/vui'
import { ref } from 'vue'
import { useDepot } from '@/composables/useDepot'
import { useSharingRulesGate } from '@/composables/useSharingRulesGate'

export type ChatAttachmentStatus = 'pending' | 'uploading' | 'done' | 'error'

export interface ChatAttachment {
  id: string
  file: File
  // Object URL for image files (thumbnail preview), null otherwise. Revoked on
  // remove/clear.
  previewUrl: string | null
  status: ChatAttachmentStatus
  // Public Depot URL, set once the upload succeeds.
  url?: string
}

// Client-side sanity cap. Depot is the authority on the real limit; this just
// stops an obviously-too-big file from starting a doomed upload.
const MAX_FILE_BYTES = 100 * 1024 * 1024

let _idSeq = 0

// Module-level singleton — there is only ever one active composer at a time, so
// sharing a single tray is safe and lets parent components (e.g. ChatApp) call
// add() from a drag handler without needing a separate composable instance.
const attachments = ref<ChatAttachment[]>([])
const uploading = ref(false)

/**
 * Shared attachment tray for the chat composer. Holds the files queued for the
 * next send, mints thumbnail previews for images, and uploads everything to
 * Depot on demand.
 */
export function useChatAttachments() {
  const depot = useDepot()
  const rulesGate = useSharingRulesGate()

  function isImage(file: File) {
    return file.type.startsWith('image/')
  }

  function addToTray(files: File[]) {
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        pushToast('File too large', { description: `${file.name} is over 100 MB.` })
        continue
      }
      attachments.value.push({
        id: `att-${_idSeq++}`,
        file,
        previewUrl: isImage(file) ? URL.createObjectURL(file) : null,
        status: 'pending',
      })
    }
  }

  // Attaching is an upload to Depot, so it goes through the sharing-rules gate:
  // if the user hasn't agreed yet, the shared modal opens and the files are
  // added once they accept. Snapshot the list first since a FileList from an
  // <input> is cleared right after this call.
  function add(files: FileList | File[]) {
    const snapshot = Array.from(files)
    if (!snapshot.length)
      return
    rulesGate.run(() => addToTray(snapshot))
  }

  function remove(id: string) {
    const idx = attachments.value.findIndex(a => a.id === id)
    if (idx === -1)
      return
    const [removed] = attachments.value.splice(idx, 1)
    if (removed?.previewUrl)
      URL.revokeObjectURL(removed.previewUrl)
  }

  function clear() {
    for (const a of attachments.value) {
      if (a.previewUrl)
        URL.revokeObjectURL(a.previewUrl)
    }
    attachments.value = []
  }

  // Upload every queued attachment to Depot and return the public URLs in order.
  // Returns null if any upload fails, leaving the tray intact so the user can
  // retry. Already-uploaded files (a previous partial run) are not re-sent.
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

  return { attachments, uploading, add, remove, clear, uploadAll }
}
