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
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove script and style tags with their content
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    // Remove all other HTML tags but keep their content
    .replace(/<[^>]*>/g, '')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, '\'')
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    // Clean up extra whitespace
    .replace(/\s+/g, ' ')
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
  const htmlTagRegex = /<[^>]*>/g
  const htmlMatches = markdown.match(htmlTagRegex)

  if (htmlMatches) {
    // Filter out false positives that might be valid markdown (like email addresses with < >)
    const actualHtmlTags = htmlMatches.filter((match) => {
      // Allow some basic patterns that aren't HTML
      return !match.match(/^<[^@\s]+@[^@\s>]+>$/) // email addresses
        && !match.match(/^<https?:\/\/[^>]+>$/) // URLs
        && match.match(/^<\/?[a-z][^>]*>$/i) // HTML tag pattern
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
