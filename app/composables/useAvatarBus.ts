// Typed bus for the `avatar-updated` window event.

const AVATAR_UPDATED_EVENT = 'avatar-updated'

export interface AvatarUpdatedPayload {
  userId: string

  /** null when the avatar was deleted. */
  url: string | null
}

// No Vue dependency, so lib code can dispatch it too.
export function dispatchAvatarUpdated(payload: AvatarUpdatedPayload): void {
  if (typeof window === 'undefined')
    return

  window.dispatchEvent(
    new CustomEvent<AvatarUpdatedPayload>(AVATAR_UPDATED_EVENT, { detail: payload }),
  )
}

// Listeners clean up on unmount inside a component. Outside one, call the
// returned off().
export function useAvatarBus() {
  function onAvatarUpdated(handler: (payload: AvatarUpdatedPayload) => void): () => void {
    function listener(event: Event) {
      const detail = (event as CustomEvent<AvatarUpdatedPayload>).detail
      if (detail != null) {
        handler(detail)
      }
    }

    if (typeof window === 'undefined')
      return () => {}

    window.addEventListener(AVATAR_UPDATED_EVENT, listener)

    const off = () => window.removeEventListener(AVATAR_UPDATED_EVENT, listener)

    if (getCurrentInstance() != null) {
      onUnmounted(off)
    }

    return off
  }

  return { onAvatarUpdated }
}
