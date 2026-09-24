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

  // Protocol-relative URLs redirect off-site.
  if (trimmed.startsWith('//'))
    return null

  // Guards against header splitting.
  if (trimmed.includes('\n') || trimmed.includes('\r'))
    return null

  return trimmed
}

/**
 * After a deploy replaces the hashed `_nuxt/` chunks, a plain
 * `location.reload()` can get the stale cached HTML that still points at
 * deleted chunks, leaving the app broken. The query param forces a network fetch.
 */
export function reloadWithCacheBust() {
  if (typeof window === 'undefined')
    return

  const url = new URL(window.location.href)

  // Set, don't append, so repeated recoveries can't stack `?_=...&_=...`.
  url.searchParams.set('_', String(Date.now()))
  window.location.replace(url.toString())
}

// Call once after boot to drop reloadWithCacheBust's `?_=` without a navigation.
export function stripCacheBustParam() {
  if (typeof window === 'undefined')
    return

  const url = new URL(window.location.href)
  if (!url.searchParams.has('_'))
    return

  url.searchParams.delete('_')
  const query = url.searchParams.toString()
  const clean = `${url.pathname}${query ? `?${query}` : ''}${url.hash}`
  window.history.replaceState(window.history.state, '', clean)
}

export function getCSSVariable(key: string) {
  if (typeof window === 'undefined')
    return ''

  return window
    .getComputedStyle(document.body)
    .getPropertyValue(key)
    .trim()
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

const SCROLL_NAVBAR_OFFSET = 92

/**
 * An id can match more than one element, e.g. a pinned-comment banner plus the
 * list copy, or flat and threaded views kept alive by v-show. querySelector
 * would return the first, which may be hidden with a zero-height rect.
 */
function findVisibleElement(id: string): HTMLElement | null {
  const els = document.querySelectorAll<HTMLElement>(id)
  if (els.length === 0)
    return null

  for (const el of els) {
    if (el.getBoundingClientRect().height > 0)
      return el
  }

  // All hidden. Return the first so callers can at least measure it.
  return els[0]!
}

/**
 * Uses `window.scrollTo` because `scrollIntoView({ block: 'start' })` can't put
 * an element near the bottom of the document below the sticky navbar.
 */
export function scrollToId(id: string, block: ScrollIntoViewOptions['block'] = 'start', smooth = false, additionalOffset = 0) {
  const el = findVisibleElement(id)
  if (!el)
    return

  const rect = el.getBoundingClientRect()
  const absoluteTop = rect.top + window.scrollY

  let target: number
  const totalOffset = SCROLL_NAVBAR_OFFSET + additionalOffset
  if (block === 'center') {
    const availableHeight = window.innerHeight - totalOffset
    target = absoluteTop - totalOffset - availableHeight / 2 + rect.height / 2
  }
  else if (block === 'end') {
    target = absoluteTop + rect.height - window.innerHeight
  }
  else {
    target = absoluteTop - totalOffset
  }

  // Instant by default: layout shifts during a smooth animation make the final
  // position drift.
  window.scrollTo({ top: Math.max(0, target), behavior: smooth ? 'smooth' : 'instant' })
}

/**
 * Re-anchors on every frame while content above the target is still loading,
 * until the position holds for `stableForMs` or `timeoutMs` passes. Any user
 * scroll (wheel, touch, keyboard) ends the loop and hands control back.
 */
export async function scrollToIdWhenStable(
  id: string,
  block: ScrollIntoViewOptions['block'] = 'start',
  timeoutMs = 5000,
  stableForMs = 150,
  additionalOffset = 0,
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

      const rect = el.getBoundingClientRect()
      const absoluteTop = rect.top + window.scrollY

      const totalOffset = SCROLL_NAVBAR_OFFSET + additionalOffset
      let target: number
      if (block === 'center') {
        const availableHeight = window.innerHeight - totalOffset
        target = absoluteTop - totalOffset - availableHeight / 2 + rect.height / 2
      }
      else if (block === 'end') {
        target = absoluteTop + rect.height - window.innerHeight
      }
      else {
        target = absoluteTop - totalOffset
      }

      window.scrollTo({ top: Math.max(0, target), behavior: 'instant' })

      // The compensating scrollTo can mask a shift in absoluteTop, so page
      // height has to settle too.
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

// Resolves once every loading image settles, or after `timeoutMs` so a broken
// image can't block a scroll forever.
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

    setTimeout(resolveOnce, timeoutMs)
  })
}

/**
 * Resolves once page height holds for `stableForMs`. Unlike `waitForImages`
 * this catches content rendered late behind <Suspense>, whose images aren't in
 * the DOM yet at mount.
 */
export async function waitForLayoutStability(timeoutMs = 8000, stableForMs = 120): Promise<void> {
  if (!import.meta.client)
    return

  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs
    let lastHeight = document.body.scrollHeight

    // Null until the first frame, so it can't resolve as stable before image
    // loads have started shifting the layout.
    let stableStart: number | null = null

    const tick = () => {
      const now = Date.now()
      const currentHeight = document.body.scrollHeight

      if (currentHeight !== lastHeight) {
        lastHeight = currentHeight
        stableStart = now
      }
      else {
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

/** First string in a Vue Router query value, or '' when there isn't one. */
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
 * Same as `getRouteQueryString`, but absent, non-string, and empty values all
 * come back as `null`.
 */
export function getRouteQueryStringOrNull(
  value: string | null | (string | null)[] | undefined,
): string | null {
  const result = getRouteQueryString(value)
  return result === '' ? null : result
}

// Supabase foreign-key joins can come back as an object or an array.
export function unwrapJoin<T>(value: T | T[] | null | undefined): T | null {
  if (value == null)
    return null

  return Array.isArray(value) ? (value[0] ?? null) : value
}
