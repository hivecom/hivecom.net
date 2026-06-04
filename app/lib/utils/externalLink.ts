/**
 * Determines whether a link points off-site (i.e. somewhere other than
 * hivecom.net, its subdomains, or localhost while developing).
 *
 * Only http(s) links are considered - schemes like mailto:, tel:, or in-page
 * anchors return false so they keep their default behaviour.
 *
 * NOTE: This intentionally uses a stricter host check than
 * `parseInternalUrl` in `useDataLinkPreview` (which uses
 * `endsWith('hivecom.net')`). Here the check is exact-or-subdomain so a
 * lookalike host such as `evilhivecom.net` is correctly treated as external.
 */
export function isExternalUrl(raw: string): boolean {
  if (!raw)
    return false

  try {
    const base = import.meta.client ? window.location.href : 'https://hivecom.net'
    const url = new URL(raw, base)

    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      return false

    const host = url.hostname
    const isKnownHost = host === 'hivecom.net'
      || host.endsWith('.hivecom.net')
      || (import.meta.dev && (host === 'localhost' || host === '127.0.0.1' || host === '::1'))

    return !isKnownHost
  }
  catch {
    return false
  }
}
