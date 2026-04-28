// Parse the VUI --transition token to get a duration in ms.
// Falls back to 600ms if unreadable (e.g. SSR or unsupported browser).
function getRippleDuration(): number {
  if (typeof window === 'undefined')
    return 600
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--transition').trim()
  // VUI token format: "0.11s cubic-bezier(...)" - grab the first time value
  const match = raw.match(/([\d.]+)(m?s)/)
  if (!match)
    return 600
  const value = Number.parseFloat(match[1] ?? '0')
  const unit = match[2] ?? 'ms'
  const ms = unit === 's' ? value * 1000 : value
  // Scale up: ripple should be noticeably longer than a standard transition,
  // but still respect the user's preference (e.g. ultra-short = snappy ripple).
  return Math.max(ms * 8, 100)
}

// Module-level guard so concurrent calls don't stack
let transitioning = false

export function useThemeTransition() {
  async function transitionTheme(
    applyFn: () => void,
    origin?: { x: number, y: number },
  ): Promise<void> {
    if (transitioning)
      return

    const x = origin?.x ?? window.innerWidth / 2
    const y = origin?.y ?? window.innerHeight / 2

    transitioning = true

    const rippleDuration = getRippleDuration()

    const maxRadius = Math.ceil(Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    ))

    // Inject the keyframe animation once
    const styleId = '__theme-ripple-style'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        @keyframes theme-ripple-expand {
          from { clip-path: circle(0px at var(--ripple-x) var(--ripple-y)); }
          to   { clip-path: circle(var(--ripple-r) at var(--ripple-x) var(--ripple-y)); }
        }
        ::view-transition-new(root) {
          animation: theme-ripple-expand var(--ripple-duration) cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        ::view-transition-old(root) {
          animation: none;
          z-index: -1;
        }
      `
      document.head.appendChild(style)
    }

    // Write ripple origin/radius as CSS custom properties on :root
    const root = document.documentElement
    root.style.setProperty('--ripple-x', `${x}px`)
    root.style.setProperty('--ripple-y', `${y}px`)
    root.style.setProperty('--ripple-r', `${maxRadius}px`)
    root.style.setProperty('--ripple-duration', `${rippleDuration}ms`)

    try {
      // startViewTransition is not available in all browsers - falls back to instant apply
      // Reflect.get returns unknown, which TS won't narrow away in the null check
      type VTFn = (cb: () => void) => { finished: Promise<void> }
      const transition = Reflect.get(document, 'startViewTransition') as VTFn | null | undefined
      if (transition == null) {
        applyFn()
        transitioning = false
        return
      }
      await transition.call(document, () => {
        applyFn()
      }).finished
    }
    catch {
      // Transition was skipped, interrupted, or unsupported - apply directly
      applyFn()
    }
    finally {
      transitioning = false
    }
  }

  return { transitionTheme }
}
