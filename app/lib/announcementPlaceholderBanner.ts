const PLACEHOLDER_BANNERS = [
  '/placeholders/banner1.jpg',
  '/placeholders/banner2.jpg',
  '/placeholders/banner3.jpg',
] as const

function normalizeSeed(seed: number | null | undefined): number {
  if (seed == null || !Number.isFinite(seed))
    return 0
  return Math.abs(Math.trunc(seed))
}

export function getAnnouncementPlaceholderBanner(seed: number | null | undefined): string {
  const normalized = normalizeSeed(seed)
  const index = normalized % PLACEHOLDER_BANNERS.length
  return PLACEHOLDER_BANNERS[index] ?? PLACEHOLDER_BANNERS[0]
}
