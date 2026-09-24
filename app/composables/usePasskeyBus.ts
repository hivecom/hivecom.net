// Typed bus for the `passkey-updated` window event.

const PASSKEY_UPDATED_EVENT = 'passkey-updated'

export interface PasskeysChangedPayload {
  /** Enrolled passkeys after the change. */
  count: number
}

export function usePasskeyBus() {
  function dispatchPasskeysChanged(payload: PasskeysChangedPayload): void {
    if (typeof window === 'undefined')
      return

    window.dispatchEvent(
      new CustomEvent<PasskeysChangedPayload>(PASSKEY_UPDATED_EVENT, { detail: payload }),
    )
  }

  function onPasskeysChanged(handler: (payload: PasskeysChangedPayload) => void): () => void {
    function listener(event: Event) {
      const detail = (event as CustomEvent<PasskeysChangedPayload>).detail
      if (detail != null) {
        handler(detail)
      }
    }

    if (typeof window === 'undefined')
      return () => {}

    window.addEventListener(PASSKEY_UPDATED_EVENT, listener)

    const off = () => window.removeEventListener(PASSKEY_UPDATED_EVENT, listener)

    if (getCurrentInstance() != null) {
      onUnmounted(off)
    }

    return off
  }

  return { dispatchPasskeysChanged, onPasskeysChanged }
}
