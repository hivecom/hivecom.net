import { isExternalUrl } from '@/lib/utils/externalLink'

/**
 * Centralised guard that intercepts clicks on off-site links inside
 * user-authored content (anything rendered through MarkdownRenderer). When the
 * `confirm_external_links` setting is enabled, clicking an external link opens a
 * confirmation modal instead of navigating straight away.
 *
 * The modal state lives in shared `useState` so a single `ExternalLinkModal`
 * mounted in `app.vue` serves every content surface in the app.
 */
export function useExternalLinkGuard() {
  const open = useState('external-link-guard-open', () => false)
  const pendingUrl = useState<string | null>('external-link-guard-url', () => null)
  const { settings } = useDataUserSettings()

  function requestNavigation(url: string) {
    pendingUrl.value = url
    open.value = true
  }

  function openPendingUrl() {
    const url = pendingUrl.value
    if (url != null && url !== '')
      window.open(url, '_blank', 'noopener,noreferrer')
  }

  function confirm(dontAskAgain = false) {
    if (dontAskAgain)
      settings.value.confirm_external_links = false
    openPendingUrl()
    open.value = false
    pendingUrl.value = null
  }

  function cancel() {
    open.value = false
    pendingUrl.value = null
  }

  /**
   * Programmatic equivalent of clicking an external link (for handlers that
   * call `window.open` directly). Routes through the confirm modal when the
   * URL is off-site and the setting is enabled, otherwise opens immediately.
   */
  function guardedOpen(url: string) {
    if (isExternalUrl(url) && settings.value.confirm_external_links) {
      requestNavigation(url)
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  /**
   * Delegated click handler to attach to a rendered-content container. Catches
   * clicks that bubble up from any anchor and intercepts off-site navigation.
   */
  function handleContentClick(event: MouseEvent) {
    // Respect modifier/middle clicks (open in new tab/window) and anything an
    // inner handler already dealt with.
    if (event.defaultPrevented)
      return
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return

    const target = event.target as HTMLElement | null
    const anchor = target?.closest('a')
    if (!anchor)
      return

    const href = anchor.getAttribute('href')
    if (href == null || href === '' || href.startsWith('#'))
      return

    if (!isExternalUrl(href))
      return

    // Setting disabled - let the link behave normally.
    if (!settings.value.confirm_external_links)
      return

    event.preventDefault()
    event.stopPropagation()
    // anchor.href resolves to the absolute URL.
    requestNavigation(anchor.href)
  }

  return {
    open,
    pendingUrl,
    requestNavigation,
    guardedOpen,
    confirm,
    cancel,
    handleContentClick,
  }
}
