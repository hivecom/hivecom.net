/**
 * Only http(s) counts. mailto:, tel: and in-page anchors return false so they
 * keep their default behaviour.
 *
 * The host check is exact-or-subdomain on purpose, so a lookalike like
 * `evilhivecom.net` counts as external. A bare `endsWith('hivecom.net')` would
 * let it through.
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
