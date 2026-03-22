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
 * Apply a theme's custom properties to a target element (defaults to `:root`).
 * Pass `null` to clear all theme overrides and revert to VUI defaults.
 *
 * Scale columns (spacing, rounding, transitions) are not applied here - they
 * need to be interpreted and mapped to actual CSS tokens by the caller, since
 * the 0-100 values are not direct CSS property values.
 */
export function applyTheme(theme: Theme | null, target: HTMLElement = document.documentElement): void {
  // Always clear previous overrides first
  for (const prefix of ['dark', 'light'] as const) {
    for (const key of VUI_COLOR_KEYS) {
      target.style.removeProperty(`--${prefix}-color-${key}`)
    }
  }

  if (theme == null)
    return

  const vars = themeToCustomProperties(theme)
  for (const [prop, value] of Object.entries(vars)) {
    target.style.setProperty(prop, value)
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

  // If it's already hex-ish, return as-is
  if (raw.startsWith('#'))
    return raw

  return '#000000'
}
