// Typed bus for the `project-banner-updated` window event.

const PROJECT_BANNER_UPDATED_EVENT = 'project-banner-updated'

export interface ProjectBannerUpdatedPayload {
  projectId: number

  /** null when the banner was deleted. */
  url: string | null
}

// No Vue dependency, so lib code can dispatch it too.
export function dispatchProjectBannerUpdated(payload: ProjectBannerUpdatedPayload): void {
  if (typeof window === 'undefined')
    return

  window.dispatchEvent(
    new CustomEvent<ProjectBannerUpdatedPayload>(PROJECT_BANNER_UPDATED_EVENT, { detail: payload }),
  )
}

// Listeners clean up on unmount inside a component. Outside one, call the
// returned off().
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
