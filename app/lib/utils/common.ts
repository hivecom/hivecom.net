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

export function scrollToId(id: string, block: ScrollIntoViewOptions['block'] = 'center') {
  const el = document.querySelector(id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block })
  }
}

/**
 * Waits for all currently-loading images in the document to either finish
 * loading or error out before resolving. Falls back after `timeoutMs`
 * milliseconds so a slow/broken image never blocks a scroll indefinitely.
 *
 * Use this before programmatic `scrollIntoView` calls that follow dynamic
 * content (markdown renders, image-heavy posts, etc.) to avoid the scroll
 * landing in the wrong spot due to images shifting the layout after mount.
 */
export async function waitForImages(timeoutMs = 4000): Promise<void> {
  return new Promise((resolve) => {
    if (!import.meta.client) {
      resolve()
      return
    }

    const images = [...document.querySelectorAll<HTMLImageElement>('img')]
    const incomplete = images.filter(img => !img.complete)

    if (incomplete.length === 0) {
      resolve()
      return
    }

    let settled = false
    const resolveOnce = () => {
      if (settled)
        return
      settled = true
      resolve()
    }

    let loadedCount = 0
    for (const img of incomplete) {
      const onSettle = () => {
        loadedCount++
        if (loadedCount >= incomplete.length)
          resolveOnce()
      }
      img.addEventListener('load', onSettle, { once: true })
      img.addEventListener('error', onSettle, { once: true })
    }

    // Safety-net: resolve after the timeout even if some images are still pending
    setTimeout(resolveOnce, timeoutMs)
  })
}

/**
 * Polls `document.body.scrollHeight` on every animation frame and resolves
 * once the height has been stable for `stableForMs` milliseconds, or the
 * hard `timeoutMs` deadline is reached.
 *
 * This is more robust than `waitForImages` for scroll-to-comment use-cases
 * because it catches late-rendered content (e.g. MarkdownRenderer behind a
 * <Suspense> boundary whose images aren't in the DOM yet at mount time) and
 * images with non-16:9 aspect ratios that shift the layout more than the CSS
 * placeholder pre-allocated.
 */
export async function waitForLayoutStability(timeoutMs = 5000, stableForMs = 500): Promise<void> {
  if (!import.meta.client)
    return

  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs
    let lastHeight = document.body.scrollHeight
    let stableStart = Date.now()

    const tick = () => {
      const now = Date.now()
      const currentHeight = document.body.scrollHeight

      if (currentHeight !== lastHeight) {
        lastHeight = currentHeight
        stableStart = now
      }

      if (now - stableStart >= stableForMs || now >= deadline) {
        resolve()
        return
      }

      requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
  })
}

export function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined
}

/**
 * Extracts a plain string from a Vue Router `LocationQueryValue` (which can be
 * `string | null`) or an array thereof.  Returns the first string found, or an
 * empty string when nothing useful is present.
 *
 * Replaces the repeated inline ternary pattern:
 *   `typeof q === 'string' ? q : Array.isArray(q) && q[0] ? q[0] : ''`
 * that appears across ~12 admin / auth pages.
 */
export function getRouteQueryString(
  value: string | null | (string | null)[] | undefined,
): string {
  if (typeof value === 'string')
    return value
  if (Array.isArray(value)) {
    const first = value.find(v => typeof v === 'string')
    return first ?? ''
  }
  return ''
}

/**
 * Same as `getRouteQueryString` but returns `null` instead of `''` when the
 * query parameter is absent or non-string.  Useful when the caller needs to
 * distinguish "not provided" from "provided as empty string".
 */
export function getRouteQueryStringOrNull(
  value: string | null | (string | null)[] | undefined,
): string | null {
  const result = getRouteQueryString(value)
  return result === '' ? null : result
}
