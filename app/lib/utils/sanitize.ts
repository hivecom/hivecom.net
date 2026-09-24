const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g
const SCRIPT_STYLE_RE = /<(script|style)[^>]*>[\s\S]*?<\/\1>/gi
const HTML_TAG_RE = /<[^>]*>/g
const AMP_RE = /&amp;/g
const LT_RE = /&lt;/g
const GT_RE = /&gt;/g
const QUOT_RE = /&quot;/g
const APOS_RE = /&#x27;/g
const SLASH_RE = /&#x2F;/g
const NBSP_RE = /&nbsp;/g
const INLINE_SPACE_RE = /[ \t]+/g
const MULTI_NEWLINE_RE = /\n\s*\n/g

const HTML_TAG_DETECT_RE = /<[^>]*>/g
const EMAIL_RE = /^<[^@\s]+@[^@\s>]+>$/
const URL_RE = /^<https?:\/\/[^>]+>$/
const HTML_ELEMENT_RE = /^<\/?[a-z][^>]*>$/i

const H1_RE = /^# (.*)$/gm

/** Leaves plain text and markdown syntax. */
export function stripHtmlTags(input: string): string {
  if (!input)
    return ''

  return input
    .replace(HTML_COMMENT_RE, '')

    // Script and style lose their content too.
    .replace(SCRIPT_STYLE_RE, '')

    .replace(HTML_TAG_RE, '')

    .replace(AMP_RE, '&')
    .replace(LT_RE, '<')
    .replace(GT_RE, '>')
    .replace(QUOT_RE, '"')
    .replace(APOS_RE, '\'')
    .replace(SLASH_RE, '/')
    .replace(NBSP_RE, ' ')

    .replace(INLINE_SPACE_RE, ' ')
    .replace(MULTI_NEWLINE_RE, '\n\n')
    .trim()
}

export function validateMarkdownNoHtml(markdown: string): { valid: boolean, error: string | null } {
  if (!markdown)
    return { valid: true, error: null }

  const htmlMatches = markdown.match(HTML_TAG_DETECT_RE)

  if (htmlMatches) {
    // Markdown autolinks like <user@example.com> and <https://...> aren't HTML.
    const actualHtmlTags = htmlMatches.filter((match) => {
      return !match.match(EMAIL_RE)
        && !match.match(URL_RE)
        && match.match(HTML_ELEMENT_RE)
    })

    if (actualHtmlTags.length > 0) {
      return {
        valid: false,
        error: 'HTML tags are not allowed in profile content. Please use Markdown formatting instead.',
      }
    }
  }

  return { valid: true, error: null }
}

const TAG_INVALID_CHARS_RE = /[^a-z0-9-]/g
const TAG_MULTI_HYPHEN_RE = /-{2,}/g
const TAG_TRIM_HYPHEN_RE = /^-+|-+$/g

export function sanitizeTag(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(TAG_INVALID_CHARS_RE, '')
    .replace(TAG_MULTI_HYPHEN_RE, '-')
    .replace(TAG_TRIM_HYPHEN_RE, '')
}

// Drops tags already in `existing`.
export function sanitizeTags(raw: string, existing: string[] = []): string[] {
  const existingSet = new Set(existing)
  return raw
    .split(',')
    .map(t => sanitizeTag(t.trim()))
    .filter(t => t.length > 0 && !existingSet.has(t))
}

export function replaceMarkdownH1(markdown: string): string {
  if (!markdown)
    return ''

  return markdown.replace(H1_RE, '## $1')
}
