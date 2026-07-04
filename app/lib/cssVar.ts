// Read a CSS custom property off the document root, trimmed. Empty string on
// the server or when unset. The one getComputedStyle the globe theme getters
// and the audio color reader both sit on. Imports nothing so neither side
// forms an import cycle through it.
export function cssVar(name: string): string {
  if (typeof window === 'undefined')
    return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
