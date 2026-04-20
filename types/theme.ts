/**
 * theme.ts
 *
 * Pure type declarations for VUI color themes.
 *
 * The `themes` table stores color values with column names like `dark_bg`,
 * `light_text_red`, etc. These map 1:1 to VUI's CSS custom properties
 * (`--dark-color-bg`, `--light-color-text-red`).
 *
 * Runtime utilities (mapping, applying) live in `app/lib/theme.ts`.
 */

import type { Database } from './database.types'

/** A theme row from the database. */
export type Theme = Database['public']['Tables']['themes']['Row']

/** The palette-independent 0-100 scale column names. */
export type ThemeScaleKey = 'spacing' | 'rounding' | 'transitions' | 'widening'

/** Only the color columns from a theme row (excludes metadata and scale columns). */
export type ThemeColors = Omit<
  Theme,
  'id' | 'created_at' | 'created_by' | 'modified_at' | 'modified_by' | 'name' | 'description' | ThemeScaleKey
>

/**
 * The 30 VUI color variable suffixes (without `--dark-color-` / `--light-color-` prefix).
 *
 * These are the canonical variable names VUI defines per palette. Column names
 * in the DB use underscores where VUI uses hyphens, and drop the `color-`
 * segment (e.g. column `dark_bg_raised` -> CSS var `--dark-color-bg-raised`).
 */
export type VuiColorKey
  = 'bg'
    | 'bg-medium'
    | 'bg-raised'
    | 'bg-lowered'
    | 'text'
    | 'text-light'
    | 'text-lighter'
    | 'text-lightest'
    | 'text-invert'
    | 'button-gray'
    | 'button-gray-hover'
    | 'button-fill'
    | 'button-fill-hover'
    | 'text-red'
    | 'bg-red-lowered'
    | 'bg-red-raised'
    | 'text-green'
    | 'bg-green-lowered'
    | 'bg-green-raised'
    | 'text-yellow'
    | 'bg-yellow-lowered'
    | 'bg-yellow-raised'
    | 'text-blue'
    | 'bg-blue-lowered'
    | 'bg-blue-raised'
    | 'border'
    | 'border-strong'
    | 'border-weak'
    | 'accent'
    | 'bg-accent-lowered'
    | 'bg-accent-raised'
