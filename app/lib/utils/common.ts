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
  if (typeof window === 'undefined')
    return ''
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

const SCROLL_NAVBAR_OFFSET = 148

/**
 * Scrolls the element matching `id` into view, positioning its top edge just
 * below the sticky navbar. Uses `window.scrollTo` instead of
 * `scrollIntoView({ block: 'start' })` so it works correctly even when the
 * target is near the bottom of the document (where `scrollIntoView` can't
 * scroll far enough to put the element at the top of the viewport).
 *
 * The `block` parameter is kept for call-site compatibility but only
 * `'start'` / `'center'` produce meaningfully different behaviour:
 * - `'start'`  → top of element sits just below the navbar (default)
 * - `'center'` → element is vertically centred in the available viewport
 */
/**
 * When multiple elements share the same id (e.g. a pinned-comment banner plus
 * the list instance, or flat-view and threaded-view copies kept alive by
 * v-show), querySelector always returns the first in DOM order which may be
 * hidden (display:none on itself or an ancestor → zero bounding rect).
 *
 * This helper walks all matching elements and returns the first one whose
 * bounding rect has a non-zero height, falling back to the very first match
 * if every instance is currently hidden.
 */
function findVisibleElement(id: string): HTMLElement | null {
  const els = document.querySelectorAll<HTMLElement>(id)
  if (els.length === 0)
    return null
  for (const el of els) {
    if (el.getBoundingClientRect().height > 0)
      return el
  }
  // All hidden - return the first so callers can at least measure it.
  return els[0]!
}

export function scrollToId(id: string, block: ScrollIntoViewOptions['block'] = 'start', smooth = false) {
  const el = findVisibleElement(id)
  if (!el)
    return

  const rect = el.getBoundingClientRect()
  const absoluteTop = rect.top + window.scrollY

  let target: number
  if (block === 'center') {
    const availableHeight = window.innerHeight - SCROLL_NAVBAR_OFFSET
    target = absoluteTop - SCROLL_NAVBAR_OFFSET - availableHeight / 2 + rect.height / 2
  }
  else {
    // 'start' and everything else: align top of element to just below navbar
    target = absoluteTop - SCROLL_NAVBAR_OFFSET
  }

  // Programmatic navigation uses 'instant' by default so layout shifts during
  // a smooth animation can't cause the final scroll position to drift.
  // Pass smooth=true only for user-visible transitions where animation matters.
  window.scrollTo({ top: Math.max(0, target), behavior: smooth ? 'smooth' : 'instant' })
}

/**
 * Scrolls to `id` and keeps re-anchoring on every animation frame while the
 * layout is still shifting (e.g. images loading, markdown rendering, newly
 * injected comment pages). Resolves once the element's absolute position has
 * been stable for `stableForMs` milliseconds, or the hard `timeoutMs`
 * deadline is hit.
 *
 * The first scroll fires immediately on the first rAF tick - no pre-flight
 * wait. The loop then keeps re-anchoring so any content that loads above the
 * target (images, markdown, late-rendered cards) gets corrected on the next
 * frame.
 *
 * If the user scrolls (wheel, touch, or keyboard) the loop exits immediately
 * and cedes control to them.
 */
export async function scrollToIdWhenStable(
  id: string,
  block: ScrollIntoViewOptions['block'] = 'start',
  timeoutMs = 5000,
  stableForMs = 150,
): Promise<void> {
  if (!import.meta.client)
    return

  const el = findVisibleElement(id)
  if (!el)
    return

  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs
    let lastAbsoluteTop: number | null = null
    let lastScrollHeight: number | null = null
    let stableStart: number | null = null
    let rafId = 0

    const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' ', 'Home', 'End'])

    function finish() {
      window.removeEventListener('wheel', onUserScroll)
      window.removeEventListener('touchmove', onUserScroll)
      window.removeEventListener('keydown', onKeydown)
      resolve()
    }

    function onUserScroll() {
      cancelAnimationFrame(rafId)
      finish()
    }

    function onKeydown(e: KeyboardEvent) {
      if (SCROLL_KEYS.has(e.key))
        onUserScroll()
    }

    window.addEventListener('wheel', onUserScroll, { passive: true, once: true })
    window.addEventListener('touchmove', onUserScroll, { passive: true, once: true })
    window.addEventListener('keydown', onKeydown, { once: true })

    const tick = () => {
      const now = Date.now()

      // Recompute the element's absolute position every frame.
      const rect = el.getBoundingClientRect()
      const absoluteTop = rect.top + window.scrollY

      let target: number
      if (block === 'center') {
        const availableHeight = window.innerHeight - SCROLL_NAVBAR_OFFSET
        target = absoluteTop - SCROLL_NAVBAR_OFFSET - availableHeight / 2 + rect.height / 2
      }
      else {
        target = absoluteTop - SCROLL_NAVBAR_OFFSET
      }

      // Always re-apply the scroll so we stay pinned to the element.
      window.scrollTo({ top: Math.max(0, target), behavior: 'instant' })

      // Track whether the element's absolute position AND the page's total
      // scroll height have both stabilised. Checking scrollHeight catches
      // content loading above (or below) the target - e.g. MarkdownRenderer
      // suspense boundaries resolving - which shifts absoluteTop but can be
      // masked by the compensating scrollTo call above.
      const scrollHeight = document.body.scrollHeight
      const positionChanged = lastAbsoluteTop === null || Math.abs(absoluteTop - lastAbsoluteTop) > 1
      const heightChanged = lastScrollHeight === null || Math.abs(scrollHeight - lastScrollHeight) > 1

      if (positionChanged || heightChanged) {
        lastAbsoluteTop = absoluteTop
        lastScrollHeight = scrollHeight
        stableStart = now
      }
      else {
        stableStart ??= now
      }

      if (now >= deadline || (stableStart !== null && now - stableStart >= stableForMs)) {
        finish()
        return
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
  })
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
export async function waitForLayoutStability(timeoutMs = 8000, stableForMs = 120): Promise<void> {
  if (!import.meta.client)
    return

  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs
    let lastHeight = document.body.scrollHeight
    // Initialise to null so the stable window only starts once we've taken
    // at least one rAF measurement - avoids a false "already stable" resolve
    // before image loads have even started shifting the layout.
    let stableStart: number | null = null

    const tick = () => {
      const now = Date.now()
      const currentHeight = document.body.scrollHeight

      if (currentHeight !== lastHeight) {
        lastHeight = currentHeight
        stableStart = now
      }
      else {
        // First tick with no change - begin the stable window now
        stableStart ??= now
      }

      if (now >= deadline || (stableStart !== null && now - stableStart >= stableForMs)) {
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
