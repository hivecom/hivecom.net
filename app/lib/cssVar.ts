// Empty on the server or when unset. Keep this import-free so its callers
// can't form an import cycle through it.
export function cssVar(name: string): string {
  if (typeof window === 'undefined')
    return ''

  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
