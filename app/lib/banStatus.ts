export function isBanActive(
  banned: boolean | null | undefined,
  banEnd: string | null | undefined,
): boolean {
  if (!banned)
    return false

  if (banEnd === null || banEnd === undefined)
    return true

  if (typeof banEnd === 'string' && banEnd.trim().length === 0)
    return true

  const banEndTime = Date.parse(banEnd)

  if (Number.isNaN(banEndTime))
    return true

  return banEndTime > Date.now()
}
