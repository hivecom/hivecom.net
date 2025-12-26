export function noop() {
  // Do nothing
}

export function clamp(min: number, value: number, max: number) {
  return Math.max(Math.min(value, max), min)
}

export function createArray(length: number, fillWith?: () => unknown) {
  return Array.from({ length }, (_, i) => fillWith !== undefined ? fillWith() : i)
}

export function normalizeInternalRedirect(value: unknown): string | null {
  if (typeof value !== 'string')
    return null

  const trimmed = value.trim()
  if (!trimmed.startsWith('/'))
    return null

  // Prevent protocol-relative and similar external redirects.
  if (trimmed.startsWith('//'))
    return null

  // Basic hardening against header splitting / weird inputs.
  if (trimmed.includes('\n') || trimmed.includes('\r'))
    return null

  return trimmed
}
