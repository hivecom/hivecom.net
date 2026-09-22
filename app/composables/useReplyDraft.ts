import type { MaybeRefOrGetter } from 'vue'
import { useEventListener } from '@vueuse/core'
import { onMounted, onUnmounted, toValue, watch } from 'vue'

/**
 * Persists an in-progress discussion reply to localStorage so it survives a
 * closed tab, a reload, or a stray file drop that navigates the page away.
 *
 * All drafts live under one key as a map of draft key -> draft. The caller
 * builds the draft key and scopes it to the signed-in user so a shared device
 * never restores someone else's reply. A null key disables persistence.
 *
 * The reply target is stored by id only. The caller resolves it back into a
 * comment on restore and drops it if the comment is gone.
 *
 * ## Usage
 *
 *   useReplyDraft(() => userId.value ? `${userId.value}:${props.id}` : null, form, {
 *     replyToId: () => replyingTo.value?.id ?? null,
 *     restoreReplyTo: id => resolveComment(id),
 *   })
 */

const DRAFTS_KEY = 'hivecom.forum.drafts'
const DRAFT_TTL = 30 * 24 * 60 * 60 * 1000 // 30 days
const PERSIST_DELAY = 300

interface ReplyDraft {
  message: string
  is_nsfw: boolean
  reply_to_id: string | null
  updated_at: number
}

interface ReplyDraftForm {
  message: string
  is_nsfw: boolean
}

interface ReplyDraftReplyTo {
  replyToId: () => string | null
  restoreReplyTo: (id: string) => Promise<void>
}

function readDrafts(): Record<string, ReplyDraft> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? '{}')
    if (parsed == null || typeof parsed !== 'object')
      return {}

    // Drop malformed and expired entries on every read so abandoned drafts
    // don't pile up forever.
    const now = Date.now()
    const drafts: Record<string, ReplyDraft> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, Partial<ReplyDraft>>)) {
      if (typeof value?.message !== 'string' || value.message === '')
        continue
      if (typeof value.updated_at !== 'number' || now - value.updated_at > DRAFT_TTL)
        continue

      drafts[key] = {
        message: value.message,
        is_nsfw: value.is_nsfw === true,
        reply_to_id: typeof value.reply_to_id === 'string' ? value.reply_to_id : null,
        updated_at: value.updated_at,
      }
    }

    return drafts
  }
  catch {
    return {}
  }
}

function writeDraft(key: string, form: ReplyDraftForm, replyToId: string | null) {
  const drafts = readDrafts()

  if (form.message.trim() === '')
    delete drafts[key]
  else
    drafts[key] = { message: form.message, is_nsfw: form.is_nsfw, reply_to_id: replyToId, updated_at: Date.now() }

  try {
    if (Object.keys(drafts).length === 0)
      localStorage.removeItem(DRAFTS_KEY)
    else
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
  }
  catch {
    // Storage full or disabled (private mode). Losing the draft backup
    // shouldn't break writing the reply itself.
  }
}

export function useReplyDraft(key: MaybeRefOrGetter<string | null>, form: ReplyDraftForm, replyTo: ReplyDraftReplyTo) {
  // The pending write remembers its own key, so a key change mid-debounce
  // still lands the old text under the old key.
  let pendingKey: string | null = null
  let pendingTimer: ReturnType<typeof setTimeout> | null = null

  // Reply target still being resolved after a restore. Writes fall back to it
  // so the save triggered by restoring the text doesn't wipe the target.
  let restoringReplyToId: string | null = null

  function flush() {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer)
      pendingTimer = null
    }

    if (pendingKey !== null) {
      writeDraft(pendingKey, form, replyTo.replyToId() ?? restoringReplyToId)
      pendingKey = null
    }
  }

  function restore(draftKey: string | null) {
    if (draftKey === null || form.message !== '')
      return

    const draft = readDrafts()[draftKey]
    if (!draft)
      return

    form.message = draft.message
    form.is_nsfw = draft.is_nsfw

    if (draft.reply_to_id !== null) {
      restoringReplyToId = draft.reply_to_id
      void replyTo.restoreReplyTo(draft.reply_to_id).finally(() => {
        restoringReplyToId = null

        // Save the resolved state, so a target that turned out to be gone
        // leaves the stored draft too.
        if (toValue(key) === draftKey && form.message.trim() !== '') {
          pendingKey = draftKey
          flush()
        }
      })
    }
  }

  // Restore after mount rather than during setup so the SSR render and the
  // hydrated client agree on an empty composer.
  onMounted(() => restore(toValue(key)))

  watch(() => toValue(key), (next, prev) => {
    if (prev != null && pendingKey === prev)
      flush()

    restore(next)
  })

  watch(() => [form.message, form.is_nsfw, replyTo.replyToId()], () => {
    const draftKey = toValue(key)
    if (!import.meta.client || draftKey === null)
      return

    // A cleared composer (after submit or a manual wipe) is written straight
    // away, so a debounced write of the old text can't bring it back.
    if (form.message.trim() === '') {
      pendingKey = draftKey
      flush()
      return
    }

    if (pendingTimer !== null)
      clearTimeout(pendingTimer)

    pendingKey = draftKey
    pendingTimer = setTimeout(flush, PERSIST_DELAY)
  })

  // pagehide covers tab close, reload, and the browser opening a dropped file
  // in place of the page. unmount covers route changes within the app.
  useEventListener('pagehide', flush)
  onUnmounted(flush)
}
