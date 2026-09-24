// Globe colours read live from CSS custom properties so they track the active
// theme, custom user themes included. Cheap enough to call every frame.

import { cssVar } from '@/lib/cssVar'

export const BACKGROUND_COLOR = 'rgba(0,0,0,0)'
export const ATMOSPHERE_COLOR = '#ddffcc'

// ---------------------------------------------------------------------------
// Canvas-based CSS color parser, for any format the browser resolves
// ------------------------------------------------------------------------
let _canvas: HTMLCanvasElement | null = null
let _ctx: CanvasRenderingContext2D | null = null

function getCanvasCtx(): CanvasRenderingContext2D | null {
  if (_ctx != null)
    return _ctx
  if (typeof document === 'undefined')
    return null

  _canvas = document.createElement('canvas')
  _canvas.width = 1
  _canvas.height = 1
  _ctx = _canvas.getContext('2d')
  return _ctx
}

function parseCssColor(color: string): [number, number, number] | null {
  const ctx = getCanvasCtx()
  if (ctx == null)
    return null

  // An invalid colour leaves fillStyle untouched, so it reads back as black.
  ctx.fillStyle = '#000'
  ctx.fillStyle = color

  ctx.clearRect(0, 0, 1, 1)
  ctx.fillRect(0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  return [d[0]!, d[1]!, d[2]!]
}

const HEX6_RE = /^#([0-9a-f]{6})$/i
const HEX3_RE = /^#([0-9a-f]{3})$/i

/** [r, g, b] in 0-255. */
export function parseColor(color: string): [number, number, number] {
  const hex6 = HEX6_RE.exec(color)
  if (hex6 != null) {
    const v = Number.parseInt(hex6[1]!, 16)
    return [(v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF]
  }

  const hex3 = HEX3_RE.exec(color)
  if (hex3 != null) {
    const [r, g, b] = hex3[1]!.split('').map(c => Number.parseInt(c + c, 16))
    return [r!, g!, b!]
  }

  return parseCssColor(color) ?? [0, 0, 0]
}

function colorToRgbString(color: string): string {
  const [r, g, b] = parseColor(color)
  return `${r},${g},${b}`
}

// ---------------------------------------------------------------------------
// Theme detection
// ------------------------------------------------------------------------
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
// Color getters
// ------------------------------------------------------------------------
export function getArcColor(): string {
  return cssVar('--color-accent') || (isLightTheme() ? '#69883e' : '#a7fc2f')
}

export function getHighlightColor(): string {
  return cssVar('--color-bg-accent-raised') || (isLightTheme() ? '#7ea34a' : '#69b103')
}

export function getTextColor(): string {
  return cssVar('--color-text') || (isLightTheme() ? '#111111' : '#eeeeee')
}

export function getHexHoverColor(): string {
  return cssVar('--color-border-strong') || (isLightTheme() ? '#bbbbbb' : '#555555')
}

export function getHexBaseColor(): string {
  return cssVar('--color-border') || (isLightTheme() ? '#dddddd' : '#333333')
}

export function getRingRgb(): string {
  const accent = cssVar('--color-accent') || (isLightTheme() ? '#69883e' : '#a7fc2f')
  return colorToRgbString(accent)
}

export function getGlobeColor(): string {
  return cssVar('--color-bg') || (isLightTheme() ? '#eeeeee' : '#111111')
}

// ---------------------------------------------------------------------------
// Blending, hex out so Three.js and globe.gl color callbacks accept it
// ------------------------------------------------------------------------
export function blendHex(from: string, to: string, t: number): string {
  const clamp = Math.max(0, Math.min(1, t))
  const [r1, g1, b1] = parseColor(from)
  const [r2, g2, b2] = parseColor(to)
  const r = Math.round(r1 + (r2 - r1) * clamp).toString(16).padStart(2, '0')
  const g = Math.round(g1 + (g2 - g1) * clamp).toString(16).padStart(2, '0')
  const b = Math.round(b1 + (b2 - b1) * clamp).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}
