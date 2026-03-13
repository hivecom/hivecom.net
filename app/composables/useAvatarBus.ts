/**
 * Typed bus for the `avatar-updated` custom window event.
 *
 * Previously dispatched as a raw untyped CustomEvent from two places in
 * `lib/storage.ts` and double-listened in `ProfileDetail.vue` (once via
 * `avatar-updated` and once via the `storage` event on the same key).
 *
 * Usage:
 *   // Dispatching (from lib/storage.ts or any non-composable context):
 *   import { dispatchAvatarUpdated } from '@/composables/useAvatarBus'
 *   dispatchAvatarUpdated({ userId, url })
 *
 *   // Listening (inside a component setup context):
 *   const { onAvatarUpdated } = useAvatarBus()
 *   onAvatarUpdated(({ userId, url }) => { ... })
 */

const AVATAR_UPDATED_EVENT = 'avatar-updated'

export interface AvatarUpdatedPayload {
  userId: string
  /** New public URL, or null if the avatar was deleted */
  url: string | null
}

/**
 * Dispatch the avatar-updated event. Safe to call from lib functions and
 * composables alike - no Vue dependency.
 */
export function dispatchAvatarUpdated(payload: AvatarUpdatedPayload): void {
  if (typeof window === 'undefined')
    return

  window.dispatchEvent(
    new CustomEvent<AvatarUpdatedPayload>(AVATAR_UPDATED_EVENT, { detail: payload }),
  )
}

/**
 * Composable for subscribing to avatar-updated events inside Vue components.
 *
 * - `onAvatarUpdated(handler)` registers a listener and auto-cleans up on
 *   unmount when called inside a component setup context. Returns an `off()`
 *   function for manual teardown if called outside a component.
 */
export function useAvatarBus() {
  function onAvatarUpdated(handler: (payload: AvatarUpdatedPayload) => void): () => void {
    function listener(event: Event) {
      const detail = (event as CustomEvent<AvatarUpdatedPayload>).detail
      if (detail != null) {
        handler(detail)
      }
    }

    window.addEventListener(AVATAR_UPDATED_EVENT, listener)

    const off = () => window.removeEventListener(AVATAR_UPDATED_EVENT, listener)

    if (getCurrentInstance() != null) {
      onUnmounted(off)
    }

    return off
  }

  return { onAvatarUpdated }
}
