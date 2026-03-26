/**
 * theme.ts
 *
 * Runtime utilities for applying VUI color themes.
 *
 * The `themes` table stores color values with column names like `dark_bg`,
 * `light_text_red`, etc. These map 1:1 to VUI's CSS custom properties
 * (`--dark-color-bg`, `--light-color-text-red`). This module handles the
 * conversion and application so consumers don't need to think about it.
 *
 * Scale columns (spacing, rounding, transitions) are stored as integers 0-100
 * in the DB and mapped to percentage multipliers that are applied to the
 * default VUI token values at runtime.
 *
 * Pure type declarations live in `types/theme.ts`.
 */

import type { Theme } from '@/types/theme'

/** Pre-compiled regex for underscore-to-hyphen conversion. */
const UNDERSCORE_RE = /_/g

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
])

/**
 * The palette-independent 0-100 scale columns.
 * These are stored separately from colors and are not mapped to CSS color vars.
 */
export const THEME_SCALE_KEYS = ['spacing', 'rounding', 'transitions'] as const
export type ThemeScaleKey = (typeof THEME_SCALE_KEYS)[number]

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
 *   - spacing:     0% - 300%   (DB 0 = no spacing, DB 100 = 3x default)
 *   - rounding:    0% - 250%   (DB 0 = sharp corners, DB 100 = 2.5x default)
 *   - transitions: 0% - 200%   (DB 0 = instant, DB 100 = 2x default)
 *
 * `defaultDb` is the DB value that reproduces the original VUI defaults
 * (i.e. 100% of the default value). For all three that is ~33 for spacing
 * (100/300), ~40 for rounding (100/250), and ~50 for transitions (100/200).
 */

export interface ScaleConfig {
  /** Minimum percentage (at DB value 0) */
  minPercent: number
  /** Maximum percentage (at DB value 100) */
  maxPercent: number
  /** The DB value that maps to exactly 100% (the VUI default) */
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
  { varName: '--space-m', defaultValue: 18 },
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
]

const TRANSITION_TOKENS: ScaleConfig['tokens'] = [
  { varName: '--transition-fast', defaultValue: 0.05 },
  { varName: '--transition', defaultValue: 0.11 },
  { varName: '--transition-slow', defaultValue: 0.25 },
]

export const SCALE_CONFIGS: Record<ThemeScaleKey, ScaleConfig> = {
  spacing: {
    minPercent: 25,
    maxPercent: 250,
    // Exact float so dbToPercent(defaultDb, 'spacing') === 100 without rounding error
    defaultDb: (100 - 25) / (250 - 25) * 100, // 33.333...
    tokens: SPACE_TOKENS,
    unit: 'px',
  },
  rounding: {
    minPercent: 0,
    maxPercent: 500,
    defaultDb: (100 - 0) / (500 - 0) * 100, // 20
    tokens: RADIUS_TOKENS,
    unit: 'px',
  },
  transitions: {
    minPercent: 0,
    maxPercent: 400,
    defaultDb: (100 - 0) / (400 - 0) * 100, // 25
    tokens: TRANSITION_TOKENS,
    unit: 's',
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
export function getCssVarAsHex(varName: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()

  if (!raw)
    return '#000000'

  // Parse rgb(...) / rgba(...)
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

  return '#000000'
}
