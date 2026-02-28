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
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/-{2,}/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, '') // Trim - from end of text
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
export function normalizeTipTapOutput(content: string): string {
  if (!content)
    return ''

  return content
    .replace(/^\s*(?:&nbsp;|\u00A0)\s*/, '')
    .replace(/(?:\s|&nbsp;)+$/, '')
}
