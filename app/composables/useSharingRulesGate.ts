/**
 * Gate any Depot upload behind the sharing-rules agreement.
 *
 * The modal open state and the held action are module-level singletons so a
 * single <SharingRulesModal> mounted on a surface (the sharing page, the chat
 * app) can be driven from anywhere - including non-component code like
 * useChatAttachments. Callers wrap the upload-triggering action in `run()`:
 * if the user has agreed it fires immediately, otherwise it's stashed and the
 * modal opens, resuming on agree.
 *
 *   const { open, agreed, run, openRules, handleAgreed, handleCancelled } = useSharingRulesGate()
 *   run(() => startUpload(files)) // prompts first if not agreed
 */

import { ref } from 'vue'
import { useSharingRulesAgreement } from './useSharingRulesAgreement'

const open = ref(false)
let pendingAction: (() => void) | null = null

export function useSharingRulesGate() {
  const { agreed, ensure, markAgreed } = useSharingRulesAgreement()

  // Run `action` if the user has agreed; otherwise hold it and open the modal.
  function run(action: () => void) {
    // Fast path stays synchronous so actions that need the click's user
    // activation (opening the file picker) keep it.
    if (agreed.value === true) {
      action()
      return
    }

    // Otherwise the value may just be unresolved: null is "the profile fetch
    // hasn't landed", not "hasn't agreed". Settle it before prompting, or an
    // already-agreed user eats the modal on their next paste.
    void ensure().then((hasAgreed) => {
      if (hasAgreed) {
        action()
        return
      }
      pendingAction = action
      open.value = true
    })
  }

  // Open the modal without a held action (the "Rules" button). View-only once
  // the user has already agreed.
  function openRules() {
    open.value = true
  }

  function handleAgreed() {
    markAgreed()
    const action = pendingAction
    pendingAction = null
    action?.()
  }

  function handleCancelled() {
    pendingAction = null
  }

  return { open, agreed, run, openRules, handleAgreed, handleCancelled }
}
