/**
 * Typed bus for the `project-banner-updated` custom window event.
 *
 * Previously dispatched as an untyped CustomEvent from `lib/projectBanner.ts`
 * and listened to with raw `window.addEventListener` + manual `as CustomEvent`
 * cast in `useCacheProjectBanner.ts`.
 *
 * Usage:
 *   // Dispatching (from lib/projectBanner.ts or any non-composable context):
 *   import { dispatchProjectBannerUpdated } from '@/composables/useProjectBannerBus'
 *   dispatchProjectBannerUpdated({ projectId, url })
 *
 *   // Listening (inside a component or composable setup context):
 *   const { onProjectBannerUpdated } = useProjectBannerBus()
 *   onProjectBannerUpdated(({ projectId, url }) => { ... })
 */

const PROJECT_BANNER_UPDATED_EVENT = 'project-banner-updated'

export interface ProjectBannerUpdatedPayload {
  projectId: number
  /** New public URL, or null if the banner was deleted */
  url: string | null
}

/**
 * Dispatch the project-banner-updated event. Safe to call from lib functions
 * and composables alike - no Vue dependency.
 */
export function dispatchProjectBannerUpdated(payload: ProjectBannerUpdatedPayload): void {
  if (typeof window === 'undefined')
    return

  window.dispatchEvent(
    new CustomEvent<ProjectBannerUpdatedPayload>(PROJECT_BANNER_UPDATED_EVENT, { detail: payload }),
  )
}

/**
 * Composable for subscribing to project-banner-updated events inside Vue
 * components or composables.
 *
 * - `onProjectBannerUpdated(handler)` registers a listener and auto-cleans up
 *   on unmount when called inside a component setup context. Returns an `off()`
 *   function for manual teardown if called outside a component.
 */
export function useProjectBannerBus() {
  function onProjectBannerUpdated(handler: (payload: ProjectBannerUpdatedPayload) => void): () => void {
    function listener(event: Event) {
      const detail = (event as CustomEvent<ProjectBannerUpdatedPayload>).detail
      if (detail != null) {
        handler(detail)
      }
    }

    if (typeof window === 'undefined')
      return () => {}

    window.addEventListener(PROJECT_BANNER_UPDATED_EVENT, listener)

    const off = () => window.removeEventListener(PROJECT_BANNER_UPDATED_EVENT, listener)

    if (getCurrentInstance() != null) {
      onUnmounted(off)
    }

    return off
  }

  return { onProjectBannerUpdated }
}
