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
    .replace(SPACES_RE, '-') // Replace spaces with -
    .replace(NON_WORD_HYPHEN_RE, '') // Remove all non-word chars
    .replace(MULTI_HYPHEN_RE, '-') // Replace multiple - with single -
    .replace(LEADING_HYPHEN_RE, '') // Trim - from start of text
    .replace(TRAILING_HYPHEN_RE, '') // Trim - from end of text
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
 * Formats a count for compact display.
 *
 * - Below `abbreviateAbove`: rendered with locale thousands separator (e.g. 2,345)
 * - abbreviateAbove–999,999: abbreviated to one decimal place with K suffix (e.g. 58.6K)
 * - 1,000,000+: abbreviated with M suffix (e.g. 1.2M)
 *
 * `abbreviateAbove` defaults to 10,000 (max 5 chars counting the comma, e.g. "9,999").
 * Pass 1_000 for a 4-char max (e.g. leaderboard badges, podium counts).
 */
export function formatCount(value: number, abbreviateAbove = 10_000): string {
  if (value < abbreviateAbove)
    return value.toLocaleString()

  if (value < 1_000_000) {
    const k = value / 1_000
    // Drop the decimal if it would round to a whole number
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`
  }

  const m = value / 1_000_000
  return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`
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
