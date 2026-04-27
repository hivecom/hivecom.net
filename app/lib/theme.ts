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
    'bg-medium': '#161616',
    'bg-raised': '#1c1c1c',
    'bg-lowered': '#0c0c0c',
    // VUI default: rgb(231, 231, 231) override
    'text': '#ffffff',
    'text-light': '#b4b4b4',
    // VUI default: rgb(90, 90, 90) override
    'text-lighter': '#6e6e6e',
    'text-lightest': '#414141',
    'text-invert': '#111111',
    'button-gray': '#2e2e2e',
    'button-gray-hover': '#262626',
    'button-fill': '#fafafa',
    'button-fill-hover': '#d2d2d2',
    'text-red': '#f34e46',
    'bg-red-lowered': '#681818',
    'bg-red-raised': '#7f1d1d',
    'text-green': '#6acf30',
    'bg-green-lowered': '#285f08',
    'bg-green-raised': '#1a7a0d',
    'text-yellow': '#ffc107',
    'bg-yellow-lowered': '#4e3400',
    'bg-yellow-raised': '#986800',
    'text-blue': '#558df5',
    'bg-blue-lowered': '#0d204a',
    'bg-blue-raised': '#1a3b77',
    'border': '#282828',
    'border-strong': '#363636',
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
    'bg-medium': '#e7e7e7',
    'bg-raised': '#dedede',
    'bg-lowered': '#ffffff',
    // VUI default: rgb(8, 8, 8) override
    'text': '#000000',
    'text-light': '#404040',
    'text-lighter': '#5c5c5c',
    'text-lightest': '#808080',
    'text-invert': '#f8f8f8',
    'button-gray': '#e0e0e0',
    'button-gray-hover': '#c6c6c6',
    'button-fill': '#0c0c0c',
    'button-fill-hover': '#343434',
    'text-red': '#d13c34',
    'bg-red-lowered': '#ac2d2d',
    'bg-red-raised': '#dc2626',
    'text-green': '#4da01d',
    'bg-green-lowered': '#2a7213',
    'bg-green-raised': '#3d9223',
    'text-yellow': '#b0810f',
    'bg-yellow-lowered': '#e6cd89',
    'bg-yellow-raised': '#fdc856',
    'text-blue': '#558df5',
    'bg-blue-lowered': '#c4d6ff',
    'bg-blue-raised': '#88b2ff',
    'border': '#c8c8c8',
    'border-strong': '#989898',
    'border-weak': '#e0e0e0',
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

/** Maps each transition shorthand token to its companion duration-only token */
const TRANSITION_DURATION_COMPANIONS: Record<string, string> = {
  '--transition-fast': '--transition-fast-duration',
  '--transition': '--transition-duration',
  '--transition-slow': '--transition-slow-duration',
}

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

// Logically group colors and their key definitions for the UI
export const COLOR_GROUPS: Record<string, typeof VUI_COLOR_KEYS[number][]> = {
  Background: ['bg', 'bg-medium', 'bg-raised', 'bg-lowered'],
  Text: ['text', 'text-light', 'text-lighter', 'text-lightest', 'text-invert'],
  Buttons: ['button-gray', 'button-gray-hover', 'button-fill', 'button-fill-hover'],
  Red: ['text-red', 'bg-red-lowered', 'bg-red-raised'],
  Green: ['text-green', 'bg-green-lowered', 'bg-green-raised'],
  Yellow: ['text-yellow', 'bg-yellow-lowered', 'bg-yellow-raised'],
  Blue: ['text-blue', 'bg-blue-lowered', 'bg-blue-raised'],
  Border: ['border', 'border-strong', 'border-weak'],
  Accent: ['accent', 'bg-accent-lowered', 'bg-accent-raised'],
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
 * Compute the scaled output value for a single token.
 * Given a token's default value and a DB scale value (0-100), returns the
 * new scaled value in the token's native unit.
 *
 * E.g. scaleToken(16, 50, 'spacing') => 24 (px)
 */
export function scaleToken(defaultValue: number, dbValue: number, key: ThemeScaleKey): number {
  return defaultValue * (dbToPercent(dbValue, key) / 100)
}

/**
 * Compute the scaled transition shorthand string for a single transition token.
 * Given a token's default duration (in seconds), a DB scale value (0-100), and
 * the token's variable name (used to look up the easing), returns a full CSS
 * transition shorthand string ready to be set on a CSS property.
 *
 * E.g. scaleTransition({ varName: '--transition', defaultValue: 0.11 }, 50) => "0.22s all cubic-bezier(.65, 0, .35, 1)"
 */
export function scaleTransition(token: { varName: string, defaultValue: number }, dbValue: number): string {
  const scaled = scaleToken(token.defaultValue, dbValue, 'transitions')
  const duration = `${Math.round(scaled * 1000) / 1000}s`
  const easing = TRANSITION_EASINGS[token.varName] ?? 'ease-in-out'
  return `${duration} all ${easing}`
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

  for (const token of cfg.tokens) {
    if (key === 'transitions') {
      // Transitions need the full shorthand: `<duration> all <easing>`
      const shorthand = scaleTransition(token, dbValue)
      target.style.setProperty(token.varName, shorthand)
      // Also set the companion duration-only token so it can be used in
      // places like transition-delay where a bare time value is required
      const companion = TRANSITION_DURATION_COMPANIONS[token.varName] ?? null
      if (companion != null)
        target.style.setProperty(companion, shorthand.split(' ')[0] ?? '')
    }
    else {
      const scaled = scaleToken(token.defaultValue, dbValue, key)
      // Spacing and rounding are simple pixel values (round to 1 decimal)
      target.style.setProperty(token.varName, `${Math.round(scaled * 10) / 10}${cfg.unit}`)
    }
  }
}

/**
 * Convert a DB column name (e.g. `dark_bg_accent_raised`) to its
 * corresponding VUI CSS custom property name (e.g. `--dark-color-bg-accent-raised`).
 */
export function columnToCssVar(column: string): string {
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

  // App-level alias token: .card-bg uses --color-bg-card which resolves to
  // --color-bg-medium. Emit it explicitly so scoped previews (e.g. ThemeSampleUI)
  // use the themed value instead of the global :root value.
  // @ts-expect-error Assignemnt
  vars['--color-bg-card'] = vars['--color-bg-medium']

  // Also inline the scale tokens (spacing, rounding, transitions) so the
  // preview card renders with the theme's own sizes, not the active :root values.
  for (const scaleKey of THEME_SCALE_KEYS) {
    const cfg = SCALE_CONFIGS[scaleKey]
    const dbValue = t[scaleKey] ?? cfg.defaultDb

    for (const token of cfg.tokens) {
      if (scaleKey === 'transitions') {
        vars[token.varName] = scaleTransition(token, dbValue)
      }
      else {
        const scaled = scaleToken(token.defaultValue, dbValue, scaleKey)
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
      // Also clear any companion duration tokens so they fall back to the
      // values defined in index.scss rather than stale theme overrides
      if (scaleKey === 'transitions') {
        const companion = TRANSITION_DURATION_COMPANIONS[token.varName] ?? null
        if (companion != null)
          target.style.removeProperty(companion)
      }
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

/**
 * Strip constructs that could be used for XSS or data exfiltration.
 * Returns the sanitized string, or empty string if the result is blank.
 */
export function sanitizeCustomCss(css: string | null | undefined): string {
  if (css == null || css === '')
    return ''

  return css
    // Strip @import rules entirely - external CSS loading is not allowed
    .replace(/@import\s[^;]+;?/gi, '')
    // Strip javascript: URI scheme wherever it appears
    .replace(/javascript\s*:/gi, '')
    // Strip expression() - old IE JS execution in CSS
    .replace(/expression\s*\(/gi, '')
    // Strip url() that reference data: or javascript: schemes
    // Note: \s+ avoids backtracking exchange with adjacent \s*; quote capture used in replacement
    .replace(/url\s*\(\s*(['"]?)(?:data:|javascript:)/gi, 'url($1about:')
    .trim()
}

export const DEFAULT_THEME = {
  id: '$default',
  name: 'Default',
  description: 'The tried and tested default skin/theme of Hivecom',
  created_at: '2024-01-01T00:00:00.000Z',
  created_by: null,
  modified_at: null,
  modified_by: null,
  forked_from: null,
  is_official: true,
  is_unmaintained: false,
  custom_css: '',
  spacing: 50,
  rounding: 20,
  transitions: 25,
  widening: 0,
  ...Object.fromEntries(
    (['dark', 'light'] as const).flatMap(palette =>
      Object.entries(VUI_DEFAULT_COLORS[palette]).map(([key, value]) => [
        `${palette}_${key.replace(HYPHEN_RE, '_')}`,
        value,
      ]),
    ),
  ),
} as Theme
