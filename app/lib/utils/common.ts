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

export function getCSSVariable(key: string) {
  return window
    .getComputedStyle(document.body)
    .getPropertyValue(key)
}

// Deep object merging
// Thanks https://stackoverflow.com/questions/27936772/how-to-deep-merge-instead-of-shallow-merge

/**
 * Simple object check (plain object, not array).
 * @param item
 */
export function isObject(
  item: unknown,
): item is Record<string, unknown> {
  return item !== null && typeof item === 'object' && !Array.isArray(item)
}

/**
 * Deep merge two or more plain objects.
 * @param target
 * @param sources
 */
export function deepMergePlainObjects<
  T extends Record<string, unknown>,
>(
  target: T,
  ...sources: Array<Partial<T>>
): T {
  if (!sources.length)
    return target

  const source = sources.shift()
  if (!source)
    return target

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      const sourceValue = source[key]
      const targetValue = target[key]

      if (isObject(sourceValue)) {
        if (!isObject(targetValue)) {
          target[key] = {} as T[typeof key]
        }
        deepMergePlainObjects(
          target[key] as Record<string, unknown>,
          sourceValue,
        )
      }
      else {
        target[key] = sourceValue as T[typeof key]
      }
    }
  }

  return deepMergePlainObjects(target, ...sources)
}
