import type { Database } from '@/types/database.types'

type RSVPStatus = Database['public']['Enums']['events_rsvp_status']

export interface RsvpUpdatedPayload {
  eventId: number
  newStatus: RSVPStatus | null
}

const RSVP_UPDATED_EVENT = 'rsvp-updated'

/**
 * Typed bus for the `rsvp-updated` custom window event.
 *
 * - `dispatch(payload)` - fire the event from the component that mutated RSVP state
 * - `onRsvpUpdated(handler)` - subscribe and automatically clean up on unmount when
 *   called inside a component setup context. Returns an `off()` function for manual
 *   teardown if called outside a component (e.g. in a plain composable or test).
 */
export function useRsvpBus() {
  function dispatch(payload: RsvpUpdatedPayload): void {
    if (typeof window === 'undefined')
      return

    window.dispatchEvent(
      new CustomEvent<RsvpUpdatedPayload>(RSVP_UPDATED_EVENT, { detail: payload }),
    )
  }

  function onRsvpUpdated(handler: (payload: RsvpUpdatedPayload) => void): () => void {
    function listener(event: Event) {
      const detail = (event as CustomEvent<RsvpUpdatedPayload>).detail
      if (detail != null) {
        handler(detail)
      }
    }

    window.addEventListener(RSVP_UPDATED_EVENT, listener)

    const off = () => window.removeEventListener(RSVP_UPDATED_EVENT, listener)

    // Register cleanup at setup time so it fires even if onMounted never ran.
    // getCurrentInstance() is non-null only when called synchronously during setup.
    if (getCurrentInstance() != null) {
      onUnmounted(off)
    }

    return off
  }

  return { dispatch, onRsvpUpdated }
}
