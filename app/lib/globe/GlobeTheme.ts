// Color constants – dark theme
export const BACKGROUND_COLOR = 'rgba(0,0,0,0)'
export const GLOBE_COLOR_DARK = '#060606'
export const ARC_COLOR_DARK = '#a7fc2f'
export const HEX_HIGHLIGHT_COLOR_DARK = '#d9ff6b'
export const HEX_COLOR_DARK = '#333333'
export const RING_COLOR_RGB_DARK = '217,255,107'

// Color constants – light theme
export const GLOBE_COLOR_LIGHT = '#fff'
export const ARC_COLOR_LIGHT = '#225500'
export const HEX_HIGHLIGHT_COLOR_LIGHT = '#225500'
export const HEX_COLOR_LIGHT = '#DDDDDD'
export const RING_COLOR_RGB_LIGHT = '88,170,64'

// Shared
export const ATMOSPHERE_COLOR = '#ddffcc'

const HEX_PAIR_RE = /.{1,2}/g

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

export function blendHex(from: string, to: string, t: number): string {
  const clamp = Math.max(0, Math.min(1, t))
  const parse = (hex: string): [number, number, number] => {
    const parts = hex.replace('#', '').match(HEX_PAIR_RE) ?? ['00', '00', '00']
    const [r = '00', g = '00', b = '00'] = parts
    return [
      Number.parseInt(r, 16),
      Number.parseInt(g, 16),
      Number.parseInt(b, 16),
    ]
  }
  const [r1, g1, b1] = parse(from)
  const [r2, g2, b2] = parse(to)
  const r = Math.round(r1 + (r2 - r1) * clamp).toString(16).padStart(2, '0')
  const g = Math.round(g1 + (g2 - g1) * clamp).toString(16).padStart(2, '0')
  const b = Math.round(b1 + (b2 - b1) * clamp).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

export function getArcColor(): string {
  return isLightTheme() ? ARC_COLOR_LIGHT : ARC_COLOR_DARK
}

export function getHighlightColor(): string {
  return isLightTheme() ? HEX_HIGHLIGHT_COLOR_LIGHT : HEX_HIGHLIGHT_COLOR_DARK
}

export function getHexBaseColor(): string {
  return isLightTheme() ? HEX_COLOR_LIGHT : HEX_COLOR_DARK
}

export function getRingRgb(): string {
  return isLightTheme() ? RING_COLOR_RGB_LIGHT : RING_COLOR_RGB_DARK
}

export function getGlobeColor(): string {
  return isLightTheme() ? GLOBE_COLOR_LIGHT : GLOBE_COLOR_DARK
}
