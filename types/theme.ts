import type { Database } from './database.types'

export type Theme = Database['public']['Tables']['themes']['Row']

/** 0-100 scale columns, independent of palette */
export type ThemeScaleKey = 'spacing' | 'rounding' | 'transitions' | 'widening'

export type ThemeColors = Omit<
  Theme,
  'id' | 'created_at' | 'created_by' | 'modified_at' | 'modified_by' | 'name' | 'description' | ThemeScaleKey
>

// Column `dark_bg_raised` maps to the CSS var `--dark-color-bg-raised`
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
    | 'text-purple'
    | 'bg-purple-lowered'
    | 'bg-purple-raised'
    | 'border'
    | 'border-strong'
    | 'border-weak'
    | 'accent'
    | 'bg-accent-lowered'
    | 'bg-accent-raised'
