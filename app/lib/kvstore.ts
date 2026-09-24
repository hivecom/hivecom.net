import type { Tables } from '@/types/database.overrides'

// `unknown` sidesteps recursive Json type instantiation in consumers.
export type KvEntry = Omit<Tables<'kvstore'>, 'value'> & { value: unknown }

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

// An invalid NUMBER comes back NaN. JSON stored as a string gets parsed.
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
