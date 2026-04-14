/**
 * Runtime utilities for applying VUI color themes.
 *
 * The `themes` table stores color values with column names like `dark_bg`,
 * `light_text_red`, etc. These map 1:1 to VUI's CSS custom properties
 * (`--dark-color-bg`, `--light-color-text-red`). This module handles the
 * conversion and application so consumers don't need to think about it.
 *
 * Scale columns (spacing, rounding, transitions, widening) are stored as integers 0-100
 * in the DB and mapped to percentage multipliers that are applied to the
 * default VUI token values at runtime.
 *
 * Pure type declarations live in `types/theme.ts`.
 */

import type { Theme } from '@/types/theme'

/** Pre-compiled regex for underscore-to-hyphen conversion. */
const UNDERSCORE_RE = /_/g

/** Pre-compiled regex for hyphen-to-underscore conversion. */
const HYPHEN_RE = /-/g

/** Metadata fields on the themes table that are NOT color columns. */
const THEME_META_KEYS = new Set([
  'id',
  'created_at',
  'created_by',
  'modified_at',
  'modified_by',
  'name',
  'description',
  'spacing',
  'rounding',
  'transitions',
  'widening',
])

/**
 * The palette-independent 0-100 scale columns.
 * These are stored separately from colors and are not mapped to CSS color vars.
 */
export const THEME_SCALE_KEYS = ['spacing', 'rounding', 'transitions', 'widening'] as const
export type ThemeScaleKey = (typeof THEME_SCALE_KEYS)[number]

/**
 * VUI's built-in default color values for both palettes, keyed by the same
 * suffix used in VUI_COLOR_KEYS. Used as a fallback in themeToScopedProperties
 * so that a theme with no overrides (i.e. the "Default theme" card) renders
 * the correct unthemed colors instead of inheriting the active theme from :root.
 *
 * Values are VUI's built-in palette from @dolanske/vui/dist/vui.css with the
 * project-level overrides from app/assets/index.scss applied on top.
 */
export const VUI_DEFAULT_COLORS: Record<'dark' | 'light', Record<string, string>> = {
  dark: {
    // VUI default: rgb(17, 17, 17) override
    'bg': '#111111',
    'bg-medium': 'rgb(22, 22, 22)',
    'bg-raised': 'rgb(28, 28, 28)',
    'bg-lowered': 'rgb(12, 12, 12)',
    // VUI default: rgb(231, 231, 231) override
    'text': '#ffffff',
    'text-light': 'rgb(180, 180, 180)',
    // VUI default: rgb(90, 90, 90) override
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
    // VUI default: rgb(36, 36, 36) override
    'border-weak': '#181818',
    // VUI default: rgb(193, 118, 255) override
    'accent': '#a7fc2f',
    'bg-accent-lowered': '#4e8502',
    'bg-accent-raised': '#69b103',
  },
  light: {
    // VUI default: rgb(246, 246, 246) override
    'bg': '#eeeeee',
    // VUI default: rgb(236, 236, 236) override
    'bg-medium': 'rgb(231, 231, 231)',
    'bg-raised': 'rgb(222, 222, 222)',
    'bg-lowered': 'rgb(255, 255, 255)',
    // VUI default: rgb(8, 8, 8) override
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
    // VUI default: rgb(193, 118, 255) override
    'accent': '#69883e',
    'bg-accent-lowered': '#93be57',
    'bg-accent-raised': '#7ea34a',
  },
}

/**
 * The 30 VUI color variable suffixes (without `--dark-color-` / `--light-color-` prefix).
 *
 * Column names in the DB use underscores where VUI uses hyphens, and drop the
 * `color-` segment (e.g. column `dark_bg_raised` -> CSS var `--dark-color-bg-raised`).
 */
export const VUI_COLOR_KEYS = [
  'bg',
  'bg-medium',
  'bg-raised',
  'bg-lowered',
  'text',
  'text-light',
  'text-lighter',
  'text-lightest',
  'text-invert',
  'button-gray',
  'button-gray-hover',
  'button-fill',
  'button-fill-hover',
  'text-red',
  'bg-red-lowered',
  'bg-red-raised',
  'text-green',
  'bg-green-lowered',
  'bg-green-raised',
  'text-yellow',
  'bg-yellow-lowered',
  'bg-yellow-raised',
  'text-blue',
  'bg-blue-lowered',
  'bg-blue-raised',
  'border',
  'border-strong',
  'border-weak',
  'accent',
  'bg-accent-lowered',
  'bg-accent-raised',
] as const

/**
 * Configuration for each scale key: the CSS variables it controls,
 * their default (VUI) values, and the percentage range the 0-100 DB
 * value maps to.
 *
 * `minPercent` / `maxPercent` define the output range.
 *   - spacing:     0% - 200%   (DB 0 = no spacing, DB 50 = VUI default, DB 100 = 2x default)
 *   - rounding:    0% - 500%   (DB 0 = sharp corners, DB 20 = VUI default, DB 100 = 5x default)
 *   - transitions: 0% - 400%   (DB 0 = instant, DB 25 = VUI default, DB 100 = 4x default)
 *
 * `defaultDb` is the DB value that reproduces the original VUI defaults
 * (i.e. 100% of the default value). Must be stored as an integer.
 * Formula (with minPercent=0): defaultDb = 10000 / maxPercent
 */

export interface ScaleConfig {
  /** Minimum percentage (at DB value 0) */
  minPercent: number
  /** Maximum percentage (at DB value 100) */
  maxPercent: number
  /** The DB value that maps to exactly 100% (the VUI default). Must be an integer. */
  defaultDb: number
  /** CSS variable names and their default pixel/time values */
  tokens: { varName: string, defaultValue: number }[]
  /** Unit suffix for the generated CSS values */
  unit: string
}

// Default VUI space, radius and transition tokens, copied over from the project
const SPACE_TOKENS: ScaleConfig['tokens'] = [
  { varName: '--space-xxs', defaultValue: 4 },
  { varName: '--space-xs', defaultValue: 8 },
  { varName: '--space-s', defaultValue: 12 },
  { varName: '--space-m', defaultValue: 16 },
  { varName: '--space-l', defaultValue: 24 },
  { varName: '--space-xl', defaultValue: 34 },
  { varName: '--space-xxl', defaultValue: 48 },
  { varName: '--space-xxxl', defaultValue: 64 },
]

const RADIUS_TOKENS: ScaleConfig['tokens'] = [
  { varName: '--border-radius-xs', defaultValue: 3 },
  { varName: '--border-radius-s', defaultValue: 5 },
  { varName: '--border-radius-m', defaultValue: 8 },
  { varName: '--border-radius-l', defaultValue: 12 },
  { varName: '--border-radius-pill', defaultValue: 99 },
]

const TRANSITION_TOKENS: ScaleConfig['tokens'] = [
  { varName: '--transition-fast', defaultValue: 0.05 },
  { varName: '--transition', defaultValue: 0.11 },
  { varName: '--transition-slow', defaultValue: 0.25 },
]

const CONTAINER_TOKENS: ScaleConfig['tokens'] = [
  { varName: '--container-xs', defaultValue: 360 },
  { varName: '--container-s', defaultValue: 728 },
  { varName: '--container-m', defaultValue: 968 },
  { varName: '--container-l', defaultValue: 1280 },
  { varName: '--container-xl', defaultValue: 1540 },
  { varName: '--container-xxl', defaultValue: 1920 },
]

export const SCALE_CONFIGS: Record<ThemeScaleKey, ScaleConfig> = {
  spacing: {
    minPercent: 0,
    maxPercent: 200,
    defaultDb: 50,
    tokens: SPACE_TOKENS,
    unit: 'px',
  },
  rounding: {
    minPercent: 0,
    maxPercent: 500,
    defaultDb: 20,
    tokens: RADIUS_TOKENS,
    unit: 'px',
  },
  transitions: {
    minPercent: 0,
    maxPercent: 400,
    defaultDb: 25,
    tokens: TRANSITION_TOKENS,
    unit: 's',
  },
  widening: {
    minPercent: 100,
    maxPercent: 300,
    defaultDb: 0,
    tokens: CONTAINER_TOKENS,
    unit: 'px',
  },
}

/**
 * Convert a DB value (0-100) to the actual percentage multiplier.
 * E.g. for spacing: dbToPercent(50, 'spacing') => 150 (%)
 */
export function dbToPercent(dbValue: number, key: ThemeScaleKey): number {
  const cfg = SCALE_CONFIGS[key]
  return cfg.minPercent + (dbValue / 100) * (cfg.maxPercent - cfg.minPercent)
}

/**
 * Convert a percentage multiplier back to a DB value (0-100).
 * E.g. for spacing: percentToDb(150, 'spacing') => 50
 */
export function percentToDb(percent: number, key: ThemeScaleKey): number {
  const cfg = SCALE_CONFIGS[key]
  return Math.round(((percent - cfg.minPercent) / (cfg.maxPercent - cfg.minPercent)) * 100)
}

/** Easing names for VUI transitions, keyed by variable name */
const TRANSITION_EASINGS: Record<string, string> = {
  '--transition-fast': 'ease-in-out',
  '--transition': 'cubic-bezier(.65, 0, .35, 1)',
  '--transition-slow': 'cubic-bezier(.65, 0, .35, 1)',
}

/**
 * Apply a single scale value (0-100) to the DOM by computing each token's
 * scaled value and setting it on the target element.
 */
export function applyScale(
  key: ThemeScaleKey,
  dbValue: number,
  target: HTMLElement = document.documentElement,
): void {
  const cfg = SCALE_CONFIGS[key]
  const multiplier = dbToPercent(dbValue, key) / 100

  for (const token of cfg.tokens) {
    const scaled = token.defaultValue * multiplier

    if (key === 'transitions') {
      // Transitions need the full shorthand: `<duration> all <easing>`
      const easing = TRANSITION_EASINGS[token.varName] ?? 'ease-in-out'
      const duration = `${Math.round(scaled * 1000) / 1000}s`
      target.style.setProperty(token.varName, `${duration} all ${easing}`)
    }
    else {
      // Spacing and rounding are simple pixel values (round to 1 decimal)
      target.style.setProperty(token.varName, `${Math.round(scaled * 10) / 10}${cfg.unit}`)
    }
  }
}

/**
 * Convert a DB column name (e.g. `dark_bg_accent_raised`) to its
 * corresponding VUI CSS custom property name (e.g. `--dark-color-bg-accent-raised`).
 */
function columnToCssVar(column: string): string {
  // Column format: `{dark|light}_{suffix_with_underscores}`
  // CSS var format: `--{dark|light}-color-{suffix-with-hyphens}`
  const firstUnderscore = column.indexOf('_')
  const prefix = column.slice(0, firstUnderscore) // 'dark' or 'light'
  const suffix = column.slice(firstUnderscore + 1).replace(UNDERSCORE_RE, '-')
  return `--${prefix}-color-${suffix}`
}

/**
 * Convert a theme row into a `Record<css-variable-name, color-value>` map
 * ready to be applied to `:root` via `style.setProperty()`.
 *
 * Only color columns are included - metadata fields are stripped.
 */
export function themeToCustomProperties(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {}

  for (const [key, value] of Object.entries(theme)) {
    if (THEME_META_KEYS.has(key))
      continue
    vars[columnToCssVar(key)] = value as string
  }

  return vars
}

/**
 * Convert a theme row into a `Record<css-variable-name, color-value>` map
 * that resolves the correct palette and emits direct `--color-*` overrides.
 *
 * VUI maps `--color-bg` -> `var(--dark-color-bg)` only at `:root`, so setting
 * `--dark-color-*` on a scoped child element does not propagate - the `var()`
 * reference is still resolved at `:root`. This helper bypasses that by reading
 * the active palette (`dark` or `light`) and emitting `--color-{key}` directly
 * with the theme's stored value, making it safe to bind to a preview element
 * via `:style`.
 *
 * Pass `palette` explicitly (e.g. from VUI's `theme` ref) to match the current
 * user-facing color scheme.
 */
export function themeToScopedProperties(t: Theme, palette: 'dark' | 'light'): Record<string, string> {
  const vars: Record<string, string> = {}
  const defaults = VUI_DEFAULT_COLORS[palette]

  for (const key of VUI_COLOR_KEYS) {
    // DB column: `dark_bg_raised` / `light_bg_raised` (hyphens -> underscores)
    const col = `${palette}_${key.replace(HYPHEN_RE, '_')}` as keyof Theme
    const value = t[col]
    // Fall back to the VUI built-in default so a theme with no overrides
    vars[`--color-${key}`] = (value ?? defaults[key]) as string
  }

  // Also inline the scale tokens (spacing, rounding, transitions) so the
  // preview card renders with the theme's own sizes, not the active :root values.
  for (const scaleKey of THEME_SCALE_KEYS) {
    const cfg = SCALE_CONFIGS[scaleKey]
    const dbValue = t[scaleKey] ?? cfg.defaultDb
    const multiplier = dbToPercent(dbValue, scaleKey) / 100

    for (const token of cfg.tokens) {
      const scaled = token.defaultValue * multiplier

      if (scaleKey === 'transitions') {
        const easing = TRANSITION_EASINGS[token.varName] ?? 'ease-in-out'
        const duration = `${Math.round(scaled * 1000) / 1000}s`
        vars[token.varName] = `${duration} all ${easing}`
      }
      else {
        vars[token.varName] = `${Math.round(scaled * 10) / 10}${cfg.unit}`
      }
    }
  }

  return vars
}

/**
 * Apply a theme's color and scale overrides to a target element (defaults to `:root`).
 * Pass `null` to clear all theme overrides (colors + scales) and revert to VUI defaults.
 */
export function applyTheme(theme: Theme | null, target: HTMLElement = document.documentElement): void {
  // Always clear previous color overrides
  for (const prefix of ['dark', 'light'] as const) {
    for (const key of VUI_COLOR_KEYS) {
      target.style.removeProperty(`--${prefix}-color-${key}`)
    }
  }

  // Always clear previous scale overrides
  for (const scaleKey of THEME_SCALE_KEYS) {
    for (const token of SCALE_CONFIGS[scaleKey].tokens) {
      target.style.removeProperty(token.varName)
    }
  }

  if (theme == null)
    return

  // Apply colors
  const vars = themeToCustomProperties(theme)
  for (const [prop, value] of Object.entries(vars)) {
    target.style.setProperty(prop, value)
  }

  // Apply scales (spacing, rounding, transitions)
  for (const scaleKey of THEME_SCALE_KEYS) {
    applyScale(scaleKey, theme[scaleKey] ?? SCALE_CONFIGS[scaleKey].defaultDb, target)
  }
}

const RGB_RE = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/

/**
 * Read the current computed value of a CSS variable from :root and convert
 * it to a hex string suitable for <input type="color">.
 */
export function getCssVarAsHex(varName: string, fallback: string = '#000000'): string {
  if (typeof document === 'undefined')
    return fallback

  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  if (!raw)
    return fallback

  const match = raw.match(RGB_RE)
  if (match) {
    const r = Number(match[1])
    const g = Number(match[2])
    const b = Number(match[3])
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }

  // If it's already hex, normalise to 6-digit form
  if (raw.startsWith('#')) {
    const hex = raw.slice(1)
    if (hex.length === 3) {
      const [r, g, b] = hex
      return `#${r}${r}${g}${g}${b}${b}`
    }
    // Truncate to 6 digits in case an 8-digit (#rrggbbaa) value slips through
    return `#${hex.slice(0, 6)}`
  }

  return fallback
}

export const DEFAULT_THEME = {
  id: '$$$$default',
  created_by: null,
  name: 'Default Theme',
  description: 'The default Hivecom theme',
}
