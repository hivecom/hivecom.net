// GlobeTheme.ts
// Color getters for the globe that read from CSS custom properties so they
// automatically track the active theme (dark/light, custom user themes, etc.)
// All functions are safe to call on every frame - getComputedStyle is fast.

// Shared
export const BACKGROUND_COLOR = 'rgba(0,0,0,0)'
export const ATMOSPHERE_COLOR = '#ddffcc'

const HEX_PAIR_RE = /.{1,2}/g

// ---------------------------------------------------------------------------
// CSS variable helpers
// ---------------------------------------------------------------------------

function cssVar(name: string): string {
  if (typeof window === 'undefined')
    return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Parse a CSS hex color string into an [r, g, b] 0-255 tuple. */
function parseHex(hex: string): [number, number, number] {
  const parts = hex.replace('#', '').match(HEX_PAIR_RE) ?? ['00', '00', '00']
  const [r = '00', g = '00', b = '00'] = parts
  return [Number.parseInt(r, 16), Number.parseInt(g, 16), Number.parseInt(b, 16)]
}

/** Convert a CSS hex color to an "r,g,b" string suitable for rgba(). */
function hexToRgbString(hex: string): string {
  const [r, g, b] = parseHex(hex)
  return `${r},${g},${b}`
}

// ---------------------------------------------------------------------------
// Theme detection
// ---------------------------------------------------------------------------

export function isLightTheme(): boolean {
  if (typeof window === 'undefined')
    return false
  const root = document.documentElement
  const dataTheme = root.getAttribute('data-theme')?.toLowerCase()
  if (dataTheme === 'light')
    return true
  if (dataTheme === 'dark')
    return false
  if (root.classList.contains('light'))
    return true
  if (root.classList.contains('dark'))
    return false
  const media = window.matchMedia?.('(prefers-color-scheme: light)')
  return Boolean(media?.matches)
}

// ---------------------------------------------------------------------------
// Color getters - read live from CSS variables
// ---------------------------------------------------------------------------

export function getArcColor(): string {
  return cssVar('--color-accent') || (isLightTheme() ? '#69883e' : '#a7fc2f')
}

export function getHighlightColor(): string {
  // Use the raised accent background as the highlight - brighter than accent
  // in dark mode, a mid-tone in light mode.
  return cssVar('--color-bg-accent-raised') || (isLightTheme() ? '#7ea34a' : '#69b103')
}

export function getHexBaseColor(): string {
  return cssVar('--color-border') || (isLightTheme() ? '#dddddd' : '#333333')
}

export function getRingRgb(): string {
  const accent = cssVar('--color-accent') || (isLightTheme() ? '#69883e' : '#a7fc2f')
  return hexToRgbString(accent)
}

export function getGlobeColor(): string {
  return cssVar('--color-bg') || (isLightTheme() ? '#eeeeee' : '#111111')
}

// ---------------------------------------------------------------------------
// Utility - kept here as it's tightly coupled to hex color blending
// ---------------------------------------------------------------------------

export function blendHex(from: string, to: string, t: number): string {
  const clamp = Math.max(0, Math.min(1, t))
  const [r1, g1, b1] = parseHex(from)
  const [r2, g2, b2] = parseHex(to)
  const r = Math.round(r1 + (r2 - r1) * clamp).toString(16).padStart(2, '0')
  const g = Math.round(g1 + (g2 - g1) * clamp).toString(16).padStart(2, '0')
  const b = Math.round(b1 + (b2 - b1) * clamp).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}
