import { onMounted, onScopeDispose, watch } from 'vue'

/**
 * Manages a red-dot badge overlay on the favicon.
 * Pass a reactive boolean `hasActivity`; when true the favicon gets a red dot.
 * The dot is cleared automatically when the browser tab regains focus.
 */
export function useFaviconBadge(hasActivity: Ref<boolean>) {
  if (import.meta.server)
    return

  let originalHref: string | null = null
  let badgeHref: string | null = null

  function getLinkEl(): HTMLLinkElement {
    let el = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    if (!el) {
      el = document.createElement('link')
      el.rel = 'icon'
      document.head.appendChild(el)
    }
    return el
  }

  async function buildBadgeFavicon(src: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const size = 32
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(src)
          return
        }
        ctx.drawImage(img, 0, 0, size, size)

        // Red dot - bottom-right quadrant
        const dotR = 7
        const dotX = size - dotR - 1
        const dotY = size - dotR - 1

        ctx.beginPath()
        ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2)
        ctx.fillStyle = '#e53e3e'
        ctx.fill()

        // Thin white ring so dot is visible on all backgrounds
        ctx.beginPath()
        ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2)
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        ctx.stroke()

        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => reject(new Error(`Failed to load favicon: ${src}`))
      img.src = src
    })
  }

  async function applyBadge() {
    const link = getLinkEl()

    originalHref ??= link.href || '/favicon.ico'

    if (badgeHref == null) {
      try {
        badgeHref = await buildBadgeFavicon(originalHref)
      }
      catch {
        // If canvas render fails (e.g. CORS), silently skip
        return
      }
    }

    link.href = badgeHref
  }

  function clearBadge() {
    if (originalHref == null)
      return
    const link = getLinkEl()
    link.href = originalHref
  }

  function onVisibilityChange() {
    if (!document.hidden && hasActivity.value) {
      // Tab is back in focus - keep dot until the caller resets hasActivity
      // (caller should clear it when user views notifications)
    }
  }

  onMounted(() => {
    // Snapshot original href right away before any mutations
    const link = getLinkEl()
    originalHref = link.href || '/favicon.ico'

    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onScopeDispose(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    clearBadge()
  })

  watch(
    hasActivity,
    (active) => {
      if (active)
        void applyBadge()
      else
        clearBadge()
    },
    { immediate: true },
  )
}
