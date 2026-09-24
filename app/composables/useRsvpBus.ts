import type { Database } from '@/types/database.types'

type RSVPStatus = Database['public']['Enums']['events_rsvp_status']

export interface RsvpUpdatedPayload {
  eventId: number
  newStatus: RSVPStatus | null
}

const RSVP_UPDATED_EVENT = 'rsvp-updated'

/**
 * Typed bus for the `rsvp-updated` window event. Listeners clean up on unmount
 * inside a component. Outside one, call the returned off().
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

    if (typeof window === 'undefined')
      return () => {}

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
