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

/**
 * Removes HTML tags from a string, leaving only plain text and markdown syntax
 * @param input The input string that may contain HTML
 * @returns The string with HTML tags removed
 */
export function stripHtmlTags(input: string): string {
  if (!input)
    return ''

  // Remove HTML tags while preserving markdown syntax
  return input
    // Remove HTML comments
    .replace(HTML_COMMENT_RE, '')
    // Remove script and style tags with their content
    .replace(SCRIPT_STYLE_RE, '')
    // Remove all other HTML tags but keep their content
    .replace(HTML_TAG_RE, '')
    // Decode common HTML entities
    .replace(AMP_RE, '&')
    .replace(LT_RE, '<')
    .replace(GT_RE, '>')
    .replace(QUOT_RE, '"')
    .replace(APOS_RE, '\'')
    .replace(SLASH_RE, '/')
    .replace(NBSP_RE, ' ')
    // Clean up extra whitespace while preserving newlines
    .replace(INLINE_SPACE_RE, ' ')
    .replace(MULTI_NEWLINE_RE, '\n\n')
    .trim()
}

/**
 * Validates that markdown content doesn't contain HTML tags
 * @param markdown The markdown content to validate
 * @returns Validation result with valid boolean and error message
 */
export function validateMarkdownNoHtml(markdown: string): { valid: boolean, error: string | null } {
  if (!markdown)
    return { valid: true, error: null }

  // Check for HTML tags (excluding markdown syntax)
  const htmlMatches = markdown.match(HTML_TAG_DETECT_RE)

  if (htmlMatches) {
    // Filter out false positives that might be valid markdown (like email addresses with < >)
    const actualHtmlTags = htmlMatches.filter((match) => {
      // Allow some basic patterns that aren't HTML
      return !match.match(EMAIL_RE) // email addresses
        && !match.match(URL_RE) // URLs
        && match.match(HTML_ELEMENT_RE) // HTML tag pattern
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

export function replaceMarkdownH1(markdown: string): string {
  if (!markdown)
    return ''

  return markdown.replace(H1_RE, '## $1')
}
