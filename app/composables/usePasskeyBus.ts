/**
 * Typed bus for the `passkey-updated` custom window event.
 *
 * Passkey enrollment lives in `Settings/PasskeyCard.vue`, but the sibling
 * `Settings/MfaCard.vue` also needs to know the current passkey count so it can
 * reflect "Protected by passkey" status without a full reload. This bus lets the
 * passkey card broadcast changes (add / remove) to any interested component.
 *
 * Usage:
 *   // Dispatching:
 *   const { dispatchPasskeysChanged } = usePasskeyBus()
 *   dispatchPasskeysChanged({ count })
 *
 *   // Listening (inside a component setup context):
 *   const { onPasskeysChanged } = usePasskeyBus()
 *   onPasskeysChanged(({ count }) => { ... })
 */

const PASSKEY_UPDATED_EVENT = 'passkey-updated'

export interface PasskeysChangedPayload {
  /** Number of passkeys the current user has enrolled after the change. */
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
