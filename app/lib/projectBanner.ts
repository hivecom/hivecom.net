/**
 * Project banner storage helpers.
 * Extracted from lib/storage.ts so that the project-banner subdomain is not
 * buried in the general-purpose storage module.
 *
 * uploadProjectBanner / getProjectBannerUrl / deleteProjectBanner still live in
 * lib/storage.ts and import the helpers from here.
 */

export const PROJECT_BANNER_BUCKET = 'hivecom-content-static'
export const PROJECT_BANNER_PREFIX = 'projects'
export const PROJECT_BANNER_EXTENSIONS = ['webp', 'png', 'jpg', 'jpeg'] as const

/**
 * Coerces a project id (number or numeric string) to a finite number.
 * Throws if the value cannot be safely converted.
 */
export function normalizeProjectId(projectId: number | string): number {
  const normalized = Number(projectId)
  if (!Number.isFinite(normalized))
    throw new Error('Invalid project id')
  return normalized
}

/**
 * Builds the storage path for a project banner file.
 */
export function buildProjectBannerPath(projectId: number, extension: string): string {
  return `${PROJECT_BANNER_PREFIX}/${projectId}/banner.${extension}`
}

/**
 * Dispatches a typed `project-banner-updated` CustomEvent on `window` so that
 * composables (e.g. `useCacheProjectBanner`) can react without polling.
 * No-op in non-browser environments.
 */
export function dispatchProjectBannerUpdated(projectId: number, url: string | null): void {
  if (typeof window === 'undefined')
    return

  window.dispatchEvent(
    new CustomEvent('project-banner-updated', {
      detail: { projectId, url },
    }),
  )
}
