export function truncate(value: string, length: number, suffix = '...'): string {
  if (value.length <= length)
    return value

  return value.substring(0, length) + suffix
}

export function normalizeErrors(validationObject: { errors: Record<string, string> }) {
  return Object.values(validationObject.errors)
}
