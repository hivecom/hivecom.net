/**
 * themeAdapt.ts
 *
 * Provides `adaptPaletteToTheme`, which intelligently transposes a VUI theme
 * color palette from one theme variant (dark/light) to the other.
 *
 * The core strategy:
 *   1. Parse each color into HSL.
 *   2. Classify each key's semantic role.
 *   3. Remap lightness from the source variant's expected range to the target
 *      variant's expected range, preserving relative contrast relationships.
 *   4. Keep hue and saturation unchanged so custom-tinted themes stay tinted.
 *   5. Output as rgb(r, g, b) strings.
 *
 * No external dependencies - all math is implemented inline.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

/** Lightness range [min, max] as percentages (0-100) */
type LightnessRange = [number, number]

/** Per-key lightness ranges for each variant */
interface KeyRanges {
  dark: LightnessRange
  light: LightnessRange
}

// ---------------------------------------------------------------------------
// Color parsing helpers
// ---------------------------------------------------------------------------

const RGB_STRING_RE = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/

/**
 * Parse a hex color string (#rgb, #rrggbb) into RGB components (0-255).
 */
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

/**
 * Parse an rgb(...) or rgba(...) string into RGB components (0-255).
 * Alpha is ignored.
 */
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

/**
 * Parse any supported color string (hex, rgb, rgba) into HSL.
 */
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

/**
 * Convert RGB (0-255) to HSL (h: 0-360, s: 0-100, l: 0-100).
 */
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

/**
 * Convert HSL (h: 0-360, s: 0-100, l: 0-100) to RGB (0-255).
 */
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

/**
 * Convert an HSL value to an rgb(...) CSS string.
 */
export function hslToRgb(hsl: Hsl): string {
  const { r, g, b } = hslToRgbValues(hsl)
  return `rgb(${r}, ${g}, ${b})`
}

// ---------------------------------------------------------------------------
// Lightness remapping
// ---------------------------------------------------------------------------

/**
 * Remap a lightness value from one range to another, preserving the relative
 * position within the range.
 *
 * @param l       - Source lightness (0-100)
 * @param srcMin  - Minimum of source range
 * @param srcMax  - Maximum of source range
 * @param dstMin  - Minimum of target range
 * @param dstMax  - Maximum of target range
 * @returns         Remapped lightness clamped to [0, 100]
 */
export function remapLightness(
  l: number,
  srcMin: number,
  srcMax: number,
  dstMin: number,
  dstMax: number,
): number {
  const srcSpan = srcMax - srcMin
  // If the source range is degenerate, fall back to the midpoint of dst
  if (Math.abs(srcSpan) < 0.001) {
    return (dstMin + dstMax) / 2
  }
  // Compute relative position [0..1] within source range, clamp to avoid
  // out-of-range colors blowing out the destination
  const t = Math.max(0, Math.min(1, (l - srcMin) / srcSpan))
  const mapped = dstMin + t * (dstMax - dstMin)
  return Math.max(0, Math.min(100, mapped))
}

// ---------------------------------------------------------------------------
// Per-key lightness ranges
// ---------------------------------------------------------------------------

/**
 * Expected lightness ranges for each color key in each variant.
 * These are derived from the default palettes and serve as the basis for
 * relative remapping. Custom themes that deviate from these ranges will still
 * have their relative relationships preserved within the range.
 */
const KEY_RANGES: Record<string, KeyRanges> = {
  // --- Backgrounds ---
  // Dark: very dark (L 4-12%), Light: very light (L 85-100%)
  'bg': { dark: [4, 12], light: [85, 100] },
  'bg-medium': { dark: [6, 14], light: [85, 95] },
  'bg-raised': { dark: [8, 16], light: [82, 92] },
  'bg-lowered': { dark: [3, 8], light: [95, 100] },

  // --- Foreground text ---
  // Dark: bright (L 60-100%), Light: dark (L 0-40%)
  'text': { dark: [80, 100], light: [0, 15] },
  'text-light': { dark: [55, 80], light: [15, 35] },
  'text-lighter': { dark: [35, 55], light: [25, 45] },
  'text-lightest': { dark: [18, 35], light: [40, 60] },

  // --- Inverted text (opposite of main text) ---
  // Dark: very dark (~7%), Light: very light (~97%)
  'text-invert': { dark: [4, 12], light: [88, 100] },

  // --- Button surfaces ---
  // button-gray: subtle tinted surface
  // Dark: L ~16-20%, Light: L ~80-90%
  'button-gray': { dark: [14, 22], light: [80, 92] },
  'button-gray-hover': { dark: [12, 18], light: [72, 84] },

  // button-fill: high-contrast fill (inverted from bg)
  // Dark: near-white (~96-100%), Light: near-black (~2-8%)
  'button-fill': { dark: [90, 100], light: [2, 10] },
  'button-fill-hover': { dark: [78, 92], light: [10, 25] },

  // --- Semantic text colors (red/green/yellow/blue) ---
  // Moderate shift - text needs to be readable on bg
  // Dark: relatively bright, Light: slightly darker
  'text-red': { dark: [52, 68], light: [42, 58] },
  'text-green': { dark: [48, 65], light: [35, 52] },
  'text-yellow': { dark: [50, 68], light: [35, 52] },
  'text-blue': { dark: [50, 68], light: [50, 68] }, // similar across variants

  // --- Semantic background chips (lowered) ---
  // Dark: very dark tinted (L 8-18%), Light: light pastel (L 55-75%)
  'bg-red-lowered': { dark: [8, 22], light: [55, 70] },
  'bg-green-lowered': { dark: [8, 22], light: [38, 55] },
  'bg-yellow-lowered': { dark: [8, 22], light: [72, 88] },
  'bg-blue-lowered': { dark: [8, 22], light: [72, 88] },
  'bg-accent-lowered': { dark: [18, 35], light: [55, 75] },

  // --- Semantic background chips (raised) ---
  // Dark: dark tinted (L 18-35%), Light: slightly lighter pastel (L 45-65%)
  'bg-red-raised': { dark: [18, 35], light: [50, 65] },
  'bg-green-raised': { dark: [18, 35], light: [40, 58] },
  'bg-yellow-raised': { dark: [22, 40], light: [62, 78] },
  'bg-blue-raised': { dark: [22, 40], light: [62, 78] },
  'bg-accent-raised': { dark: [28, 45], light: [48, 65] },

  // --- Borders ---
  // Dark: very dark (L 8-18%), Light: mid-gray (L 75-92%)
  'border': { dark: [10, 20], light: [72, 85] },
  'border-strong': { dark: [16, 28], light: [55, 70] },
  'border-weak': { dark: [6, 14], light: [82, 92] },

  // --- Accent ---
  // Accent keeps its hue/saturation; lightness adapts so it's visible
  // Dark: bright vibrant (L 55-75%), Light: darker vibrant (L 35-55%)
  'accent': { dark: [55, 75], light: [35, 55] },
}

// ---------------------------------------------------------------------------
// Default palettes (used as fallback ranges when a key is not in KEY_RANGES)
// ---------------------------------------------------------------------------

const DEFAULT_DARK_PALETTE: Record<string, string> = {
  'bg': '#111111',
  'bg-medium': 'rgb(22, 22, 22)',
  'bg-raised': 'rgb(28, 28, 28)',
  'bg-lowered': 'rgb(12, 12, 12)',
  'text': '#ffffff',
  'text-light': 'rgb(180, 180, 180)',
  'text-lighter': 'rgb(110, 110, 110)',
  'text-lightest': 'rgb(65, 65, 65)',
  'text-invert': 'rgb(17, 17, 17)',
  'button-gray': 'rgb(46, 46, 46)',
  'button-gray-hover': 'rgb(38, 38, 38)',
  'button-fill': 'rgb(250, 250, 250)',
  'button-fill-hover': 'rgb(210, 210, 210)',
  'text-red': 'rgb(243, 78, 70)',
  'bg-red-lowered': 'rgb(104, 24, 24)',
  'bg-red-raised': 'rgb(127, 29, 29)',
  'text-green': 'rgb(106, 207, 48)',
  'bg-green-lowered': 'rgb(40, 95, 8)',
  'bg-green-raised': 'rgb(26, 122, 13)',
  'text-yellow': 'rgb(255, 193, 7)',
  'bg-yellow-lowered': 'rgb(78, 52, 0)',
  'bg-yellow-raised': 'rgb(152, 104, 0)',
  'text-blue': 'rgb(85, 141, 245)',
  'bg-blue-lowered': 'rgb(13, 32, 74)',
  'bg-blue-raised': 'rgb(26, 59, 119)',
  'border': 'rgb(40, 40, 40)',
  'border-strong': 'rgb(54, 54, 54)',
  'border-weak': '#181818',
  'accent': '#a7fc2f',
  'bg-accent-lowered': '#4e8502',
  'bg-accent-raised': '#69b103',
}

const DEFAULT_LIGHT_PALETTE: Record<string, string> = {
  'bg': '#eeeeee',
  'bg-medium': 'rgb(231, 231, 231)',
  'bg-raised': 'rgb(222, 222, 222)',
  'bg-lowered': 'rgb(255, 255, 255)',
  'text': '#000000',
  'text-light': 'rgb(64, 64, 64)',
  'text-lighter': 'rgb(92, 92, 92)',
  'text-lightest': 'rgb(128, 128, 128)',
  'text-invert': 'rgb(248, 248, 248)',
  'button-gray': 'rgb(224, 224, 224)',
  'button-gray-hover': 'rgb(198, 198, 198)',
  'button-fill': 'rgb(12, 12, 12)',
  'button-fill-hover': 'rgb(52, 52, 52)',
  'text-red': 'rgb(209, 60, 52)',
  'bg-red-lowered': 'rgb(172, 45, 45)',
  'bg-red-raised': 'rgb(220, 38, 38)',
  'text-green': 'rgb(77, 160, 29)',
  'bg-green-lowered': 'rgb(42, 114, 19)',
  'bg-green-raised': 'rgb(61, 146, 35)',
  'text-yellow': 'rgb(176, 129, 15)',
  'bg-yellow-lowered': 'rgb(230, 205, 137)',
  'bg-yellow-raised': 'rgb(253, 200, 86)',
  'text-blue': 'rgb(85, 141, 245)',
  'bg-blue-lowered': 'rgb(196, 214, 255)',
  'bg-blue-raised': 'rgb(136, 178, 255)',
  'border': 'rgb(200, 200, 200)',
  'border-strong': 'rgb(152, 152, 152)',
  'border-weak': 'rgb(224, 224, 224)',
  'accent': '#69883e',
  'bg-accent-lowered': '#93be57',
  'bg-accent-raised': '#7ea34a',
}

// ---------------------------------------------------------------------------
// Main adaptation function
// ---------------------------------------------------------------------------

/**
 * Adapt a theme color palette from one variant to the other (dark <-> light).
 *
 * The `sourcePalette` contains the current color values for the *opposite*
 * variant (e.g. you pass the dark palette when you want to generate a light
 * palette). The function remaps each color's lightness to fit the target
 * variant's expected range, while preserving hue and saturation so that
 * custom-tinted themes remain visually coherent.
 *
 * @param sourcePalette  - The palette from the opposite variant to adapt from.
 * @param targetVariant  - The variant we want to produce ('dark' | 'light').
 * @returns               A new palette in the target variant as rgb() strings.
 */
export function adaptPaletteToTheme(
  sourcePalette: Record<string, string>,
  targetVariant: 'dark' | 'light',
): Record<string, string> {
  // The source variant is always the opposite of the target
  const sourceVariant: 'dark' | 'light' = targetVariant === 'dark' ? 'light' : 'dark'

  // The default palette for the *source* variant - used to build fallback ranges
  // when a key is missing from KEY_RANGES
  const defaultSourcePalette
    = sourceVariant === 'dark' ? DEFAULT_DARK_PALETTE : DEFAULT_LIGHT_PALETTE

  const result: Record<string, string> = {}

  for (const key of Object.keys(sourcePalette)) {
    const sourceColor = sourcePalette[key]

    // Skip empty / undefined entries
    if (sourceColor == null || sourceColor === '') {
      continue
    }

    let adapted: string

    try {
      adapted = adaptColor(key, sourceColor, sourceVariant, targetVariant, defaultSourcePalette)
    }
    catch {
      // If parsing fails (e.g. non-color value), pass the raw value through
      adapted = sourceColor
    }

    result[key] = adapted
  }

  return result
}

// ---------------------------------------------------------------------------
// Per-color adaptation logic
// ---------------------------------------------------------------------------

/**
 * Adapt a single color value for the given key.
 */
function adaptColor(
  key: string,
  sourceColor: string,
  sourceVariant: 'dark' | 'light',
  targetVariant: 'dark' | 'light',
  defaultSourcePalette: Record<string, string>,
): string {
  const hsl = parseToHsl(sourceColor)

  // Look up the predefined ranges for this key
  const ranges = KEY_RANGES[key]

  let newL: number

  if (ranges != null) {
    // We have explicit lightness ranges - remap from source to target
    const srcRange = ranges[sourceVariant]
    const dstRange = ranges[targetVariant]
    newL = remapLightness(hsl.l, srcRange[0], srcRange[1], dstRange[0], dstRange[1])
  }
  else {
    // Unknown key - fall back to a coarse dark/light inversion using the
    // default palette's color for this key (if available) to infer the range,
    // or simply invert the lightness around 50 as a last resort.
    const defaultColor = defaultSourcePalette[key]
    if (defaultColor != null && defaultColor !== '') {
      const defaultHsl = parseToHsl(defaultColor)
      // Build a range centered on the default value with +/-15% width
      const center = defaultHsl.l
      const halfWidth = 15
      const srcRange: LightnessRange = [
        Math.max(0, center - halfWidth),
        Math.min(100, center + halfWidth),
      ]
      // For the destination range, invert the center
      const dstCenter = 100 - center
      const dstRange: LightnessRange = [
        Math.max(0, dstCenter - halfWidth),
        Math.min(100, dstCenter + halfWidth),
      ]
      newL = remapLightness(hsl.l, srcRange[0], srcRange[1], dstRange[0], dstRange[1])
    }
    else {
      // Last resort: invert lightness around 50%
      newL = 100 - hsl.l
    }
  }

  // Preserve perceptual chroma rather than raw HSL saturation.
  // In HSL, actual chroma = S * min(L, 1-L) (both in 0-1 space).
  // A near-black color like #010110 has S=88% but real chroma ~5.8% -
  // blindly keeping S=88% at a light target produces a vivid pastel.
  // Instead we solve for the S that yields the same chroma at the new L.
  const srcLUnit = hsl.l / 100
  const dstLUnit = newL / 100
  const srcChromaFactor = Math.min(srcLUnit, 1 - srcLUnit)
  const dstChromaFactor = Math.min(dstLUnit, 1 - dstLUnit)
  let newS = hsl.s
  if (dstChromaFactor > 0.001 && srcChromaFactor > 0.001) {
    // Scale saturation so perceived chroma is preserved
    newS = Math.min(100, hsl.s * (srcChromaFactor / dstChromaFactor))
  }
  else if (srcChromaFactor < 0.001) {
    // Source was essentially achromatic (near pure black/white) - strip color
    newS = 0
  }

  return hslToRgb({ h: hsl.h, s: newS, l: newL })
}
