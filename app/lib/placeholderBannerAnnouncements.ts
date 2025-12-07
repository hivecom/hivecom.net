const PLACEHOLDER_BANNERS = [
  '/placeholders/banner1.jpg',
  '/placeholders/banner2.jpg',
  '/placeholders/banner3.jpg',
] as const

export interface PlaceholderBannerAnnouncement {
  url: string
  transform: string | null
}

function normalizeSeed(seed: number | null | undefined): number {
  if (seed == null || !Number.isFinite(seed))
    return 0
  return Math.abs(Math.trunc(seed))
}

function getFlipTransform(seed: number): string | null {
  const variation = seed % 4
  switch (variation) {
    case 1:
      return 'scaleX(-1)'
    case 2:
      return 'scaleY(-1)'
    case 3:
      return 'scaleX(-1) scaleY(-1)'
    default:
      return null
  }
}

export function getPlaceholderBannerAnnouncement(seed: number | null | undefined): PlaceholderBannerAnnouncement {
  const normalized = normalizeSeed(seed)
  const index = normalized % PLACEHOLDER_BANNERS.length
  return {
    url: PLACEHOLDER_BANNERS[index] ?? PLACEHOLDER_BANNERS[0],
    transform: getFlipTransform(normalized),
  }
}
