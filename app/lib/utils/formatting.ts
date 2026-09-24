const SPACES_RE = /\s+/g
const NON_WORD_HYPHEN_RE = /[^\w\-]+/g
const MULTI_HYPHEN_RE = /-{2,}/g
const LEADING_HYPHEN_RE = /^-+/
const TRAILING_HYPHEN_RE = /-+$/
const LEADING_NBSP_RE = /^\s*(?:&nbsp;|\u00A0)\s*/
const TRAILING_NBSP_RE = /(?:\s|&nbsp;)+$/

export function truncate(value: string, length: number, suffix = '...'): string {
  if (value.length <= length)
    return value

  return value.substring(0, length) + suffix
}

export function normalizeErrors(validationObject: { errors: Record<string, string> }) {
  return Object
    .values(validationObject?.errors ?? {})
    .filter(Boolean)
}

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(SPACES_RE, '-')
    .replace(NON_WORD_HYPHEN_RE, '')
    .replace(MULTI_HYPHEN_RE, '-')
    .replace(LEADING_HYPHEN_RE, '')
    .replace(TRAILING_HYPHEN_RE, '')
}

export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1, str.length)
}

/**
 * Cleans TipTap HTML content
 *
 * 1. Removes a single leading non-breaking space and surrounding whitespace.
 * 2. Removes all trailing non-breaking spaces and whitespace.
 * 3. Preserves all internal spacing.
 */
/**
 * "2,345" below `abbreviateAbove`, compact "58.6K" at or above it. Pass 1_000
 * for a 4-character max.
 */
export function formatCount(value: number, abbreviateAbove = 10_000): string {
  if (value < abbreviateAbove)
    return new Intl.NumberFormat(undefined).format(value)

  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

/** Takes 0-100, not 0-1. */
export function formatPercent(value: number, decimalPlaces = 1): string {
  return new Intl.NumberFormat(undefined, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: decimalPlaces,
  }).format(value / 100)
}

export function normalizeTipTapOutput(content: string): string {
  if (!content)
    return ''

  return content
    .replace(LEADING_NBSP_RE, '')
    .replace(TRAILING_NBSP_RE, '')
}

export function wrapCode(template: string, language: string) {
  return `\`\`\`${language}\n${template}\n\`\`\``
}
