import type { Tables } from '@/types/database.types'

// Use a permissive value type to avoid recursive Json instantiation in consumers.
export type KvEntry = Omit<Tables<'kvstore'>, 'value'> & { value: unknown }

/**
 * Return the raw value as a string for display/search without altering semantics.
 */
export function renderKvValue(value: unknown): string {
  if (value === null || value === undefined)
    return '-'

  if (typeof value === 'string')
    return value

  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)

  try {
    return JSON.stringify(value)
  }
  catch {
    return String(value)
  }
}

/**
 * Safely coerce a kvstore row into a typed JS value based on its declared type.
 * - STRING: string
 * - NUMBER: number (NaN if invalid)
 * - BOOLEAN: boolean
 * - JSON: object/array/primitive (parsed if stored as string)
 */
export function parseKvValue(entry: Pick<KvEntry, 'type' | 'value'>): unknown {
  const { type, value } = entry

  switch (type) {
    case 'STRING':
      return value == null ? '' : String(value)
    case 'NUMBER':
      return typeof value === 'number' ? value : Number(value)
    case 'BOOLEAN':
      return Boolean(value)
    case 'JSON': {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value)
        }
        catch {
          return value
        }
      }
      return value
    }
    default:
      return value
  }
}
