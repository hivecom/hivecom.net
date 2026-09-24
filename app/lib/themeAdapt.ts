/**
 * Transposes a VUI palette between dark and light. Each key's lightness is
 * remapped from the source variant's expected range to the target's, which
 * keeps relative contrast. Hue is kept and saturation is rescaled to hold
 * chroma, so custom-tinted themes stay tinted.
 */

import { VUI_DEFAULT_COLORS } from './theme'

// ---------------------------------------------------------------------------
// Types
// ------------------------------------------------------------------------
interface Hsl {
  h: number // 0-360
  s: number // 0-100
  l: number // 0-100
}

interface Rgb {
  r: number // 0-255
  g: number // 0-255
  b: number // 0-255
}

/** [min, max] lightness, 0-100 */
type LightnessRange = [number, number]

interface KeyRanges {
  dark: LightnessRange
  light: LightnessRange
}

// ---------------------------------------------------------------------------
// Color parsing helpers
// ------------------------------------------------------------------------
const RGB_STRING_RE = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/

function parseHex(hex: string): Rgb {
  const clean = hex.replace('#', '')
  let full = clean
  if (clean.length === 3) {
    full = clean[0]! + clean[0]! + clean[1]! + clean[1]! + clean[2]! + clean[2]!
  }
  const n = Number.parseInt(full, 16)
  return {
    r: (n >> 16) & 0xFF,
    g: (n >> 8) & 0xFF,
    b: n & 0xFF,
  }
}

// Alpha is ignored.
function parseRgbString(value: string): Rgb {
  const match = value.match(RGB_STRING_RE)
  if (!match) {
    throw new Error(`Cannot parse rgb/rgba color: "${value}"`)
  }
  return {
    r: Math.round(Number(match[1])),
    g: Math.round(Number(match[2])),
    b: Math.round(Number(match[3])),
  }
}

export function parseToHsl(value: string): Hsl {
  const trimmed = value.trim()
  let rgb: Rgb

  if (trimmed.startsWith('#')) {
    rgb = parseHex(trimmed)
  }
  else if (trimmed.startsWith('rgb')) {
    rgb = parseRgbString(trimmed)
  }
  else {
    throw new Error(`Unsupported color format: "${trimmed}"`)
  }

  return rgbToHsl(rgb)
}

function rgbToHsl(rgb: Rgb): Hsl {
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1))

    if (max === r) {
      h = ((g - b) / delta + (g < b ? 6 : 0)) / 6
    }
    else if (max === g) {
      h = ((b - r) / delta + 2) / 6
    }
    else {
      h = ((r - g) / delta + 4) / 6
    }
  }

  return {
    h: h * 360,
    s: s * 100,
    l: l * 100,
  }
}

function hslToRgbValues(hsl: Hsl): Rgb {
  const h = hsl.h / 360
  const s = hsl.s / 100
  const l = hsl.l / 100

  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v }
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t
    if (tt < 0)
      tt += 1
    if (tt > 1)
      tt -= 1
    if (tt < 1 / 6)
      return p + (q - p) * 6 * tt
    if (tt < 1 / 2)
      return q
    if (tt < 2 / 3)
      return p + (q - p) * (2 / 3 - tt) * 6

    return p
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  }
}

export function hslToRgb(hsl: Hsl): string {
  const { r, g, b } = hslToRgbValues(hsl)
  return `rgb(${r}, ${g}, ${b})`
}

// ---------------------------------------------------------------------------
// Lightness remapping
// ------------------------------------------------------------------------
/** Keeps the relative position within the range. Result is clamped to 0-100. */
export function remapLightness(
  l: number,
  srcMin: number,
  srcMax: number,
  dstMin: number,
  dstMax: number,
): number {
  const srcSpan = srcMax - srcMin

  if (Math.abs(srcSpan) < 0.001) {
    return (dstMin + dstMax) / 2
  }

  // Clamped so an out-of-range colour can't blow out the destination.
  const t = Math.max(0, Math.min(1, (l - srcMin) / srcSpan))
  const mapped = dstMin + t * (dstMax - dstMin)
  return Math.max(0, Math.min(100, mapped))
}

// ---------------------------------------------------------------------------
// Per-key lightness ranges
// ------------------------------------------------------------------------
// Expected lightness per key and variant, derived from the default palettes.
const KEY_RANGES: Record<string, KeyRanges> = {
  'bg': { dark: [4, 12], light: [85, 100] },
  'bg-medium': { dark: [6, 14], light: [85, 95] },
  'bg-raised': { dark: [8, 16], light: [82, 92] },
  'bg-lowered': { dark: [3, 8], light: [95, 100] },

  'text': { dark: [80, 100], light: [0, 15] },
  'text-light': { dark: [55, 80], light: [15, 35] },
  'text-lighter': { dark: [35, 55], light: [25, 45] },
  'text-lightest': { dark: [18, 35], light: [40, 60] },

  'text-invert': { dark: [4, 12], light: [88, 100] },

  'button-gray': { dark: [14, 22], light: [80, 92] },
  'button-gray-hover': { dark: [12, 18], light: [72, 84] },

  // High-contrast fill, inverted from bg.
  'button-fill': { dark: [90, 100], light: [2, 10] },
  'button-fill-hover': { dark: [78, 92], light: [10, 25] },

  // Only a moderate shift, since these have to stay readable on bg.
  'text-red': { dark: [52, 68], light: [42, 58] },
  'text-green': { dark: [48, 65], light: [35, 52] },
  'text-yellow': { dark: [50, 68], light: [35, 52] },
  'text-blue': { dark: [50, 68], light: [50, 68] },

  'bg-red-lowered': { dark: [8, 22], light: [55, 70] },
  'bg-green-lowered': { dark: [8, 22], light: [38, 55] },
  'bg-yellow-lowered': { dark: [8, 22], light: [72, 88] },
  'bg-blue-lowered': { dark: [8, 22], light: [72, 88] },
  'bg-accent-lowered': { dark: [18, 35], light: [55, 75] },

  'bg-red-raised': { dark: [18, 35], light: [50, 65] },
  'bg-green-raised': { dark: [18, 35], light: [40, 58] },
  'bg-yellow-raised': { dark: [22, 40], light: [62, 78] },
  'bg-blue-raised': { dark: [22, 40], light: [62, 78] },
  'bg-accent-raised': { dark: [28, 45], light: [48, 65] },

  'border': { dark: [10, 20], light: [72, 85] },
  'border-strong': { dark: [16, 28], light: [55, 70] },
  'border-weak': { dark: [6, 14], light: [82, 92] },

  'accent': { dark: [55, 75], light: [35, 55] },
}

// ---------------------------------------------------------------------------
// Main adaptation function
// ------------------------------------------------------------------------
/**
 * `sourcePalette` is the opposite variant: pass the dark palette to get a
 * light one. Output colours are rgb() strings.
 */
export function adaptPaletteToTheme(
  sourcePalette: Record<string, string>,
  targetVariant: 'dark' | 'light',
): Record<string, string> {
  const sourceVariant: 'dark' | 'light' = targetVariant === 'dark' ? 'light' : 'dark'

  // Builds fallback ranges for keys missing from KEY_RANGES.
  const defaultSourcePalette
    = sourceVariant === 'dark' ? VUI_DEFAULT_COLORS.dark : VUI_DEFAULT_COLORS.light

  const result: Record<string, string> = {}

  for (const key of Object.keys(sourcePalette)) {
    const sourceColor = sourcePalette[key]

    if (sourceColor == null || sourceColor === '') {
      continue
    }

    let adapted: string

    try {
      adapted = adaptColor(key, sourceColor, sourceVariant, targetVariant, defaultSourcePalette)
    }
    catch {
      // Non-colour values pass through raw.
      adapted = sourceColor
    }

    result[key] = adapted
  }

  return result
}

// ---------------------------------------------------------------------------
// Per-color adaptation logic
// ------------------------------------------------------------------------
function adaptColor(
  key: string,
  sourceColor: string,
  sourceVariant: 'dark' | 'light',
  targetVariant: 'dark' | 'light',
  defaultSourcePalette: Record<string, string>,
): string {
  const hsl = parseToHsl(sourceColor)

  const ranges = KEY_RANGES[key]

  let newL: number

  if (ranges != null) {
    const srcRange = ranges[sourceVariant]
    const dstRange = ranges[targetVariant]
    newL = remapLightness(hsl.l, srcRange[0], srcRange[1], dstRange[0], dstRange[1])
  }
  else {
    // Unknown key: infer a range from the default palette, or invert around 50.
    const defaultColor = defaultSourcePalette[key]
    if (defaultColor != null && defaultColor !== '') {
      const defaultHsl = parseToHsl(defaultColor)

      const center = defaultHsl.l
      const halfWidth = 15
      const srcRange: LightnessRange = [
        Math.max(0, center - halfWidth),
        Math.min(100, center + halfWidth),
      ]

      const dstCenter = 100 - center
      const dstRange: LightnessRange = [
        Math.max(0, dstCenter - halfWidth),
        Math.min(100, dstCenter + halfWidth),
      ]
      newL = remapLightness(hsl.l, srcRange[0], srcRange[1], dstRange[0], dstRange[1])
    }
    else {
      newL = 100 - hsl.l
    }
  }

  // Preserve chroma, not raw HSL saturation. Chroma = S * min(L, 1-L), so a
  // near-black like #010110 has S=88% but ~5.8% chroma. Keeping S=88% at a
  // light target gives a vivid pastel, so solve for the S that holds chroma.
  const srcLUnit = hsl.l / 100
  const dstLUnit = newL / 100
  const srcChromaFactor = Math.min(srcLUnit, 1 - srcLUnit)
  const dstChromaFactor = Math.min(dstLUnit, 1 - dstLUnit)
  let newS = hsl.s
  if (dstChromaFactor > 0.001 && srcChromaFactor > 0.001) {
    newS = Math.min(100, hsl.s * (srcChromaFactor / dstChromaFactor))
  }
  else if (srcChromaFactor < 0.001) {
    // Near pure black or white, so there's no real colour to keep.
    newS = 0
  }

  return hslToRgb({ h: hsl.h, s: newS, l: newL })
}
