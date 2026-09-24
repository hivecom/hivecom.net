import { dispatchProjectBannerUpdated as _dispatch } from '@/composables/useProjectBannerBus'

export const PROJECT_BANNER_BUCKET = 'hivecom-content-static'
export const PROJECT_BANNER_PREFIX = 'projects'
export const PROJECT_BANNER_EXTENSIONS = ['webp', 'png', 'jpg', 'jpeg'] as const

export function normalizeProjectId(projectId: number | string): number {
  const normalized = Number(projectId)
  if (!Number.isFinite(normalized))
    throw new Error('Invalid project id')

  return normalized
}

export function buildProjectBannerPath(projectId: number, extension: string): string {
  return `${PROJECT_BANNER_PREFIX}/${projectId}/banner.${extension}`
}

export function dispatchProjectBannerUpdated(projectId: number, url: string | null): void {
  _dispatch({ projectId, url })
}
