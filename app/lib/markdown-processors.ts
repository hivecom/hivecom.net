import { truncate } from './utils/formatting'

/**
 * Processes markdown text to convert @username mentions into proper markdown links
 * @param markdown The markdown content to process
 * @returns The processed markdown with mentions converted to links
 */
export function processMentions(markdown: string): string {
  if (!markdown)
    return ''

  // Pattern to match @username mentions
  // Username can contain letters, numbers, and underscores (matching our profile validation)
  const mentionPattern = /@(\w+)/g

  return markdown.replace(mentionPattern, (match, username: string) => {
    // Validate username before creating link
    if (!isValidMentionUsername(username)) {
      return match // Return original text if username is invalid
    }

    // Convert @username to [username](/profile/username) markdown link
    return `[@${username}](/profile/${username})`
  })
}

/**
 * Validates if a username is valid for mentions
 * @param username The username to validate
 * @returns true if the username is valid for mentions
 */
export function isValidMentionUsername(username: string): boolean {
  // Same validation as in ProfileForm - only letters, numbers, and underscores
  return /^\w+$/.test(username) && username.length <= 32
}

/**
 * Strips markdown from a content leaving only the strings.
 *
 * @param content Content to strip markdown out of
 * @param length (optional) Optionally truncate the string to make the operation less expensive
 */
export function stripMarkdown(content: string, truncateAmount = 0) {
  if (truncateAmount) {
    content = truncate(content, truncateAmount)
  }

  return content
    // 1. Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // 2. Remove horizontal rules
    .replace(/^---/gm, '')
    // 3. Remove headers (###)
    .replace(/^#+\s+/gm, '')
    // 4. Remove bold/italic (** or __)
    .replace(/([*_]{1,3})(\S.*?\S?)\1/g, '$2')
    // 5. Remove links [text](url) -> "text"
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // 6. Remove code blocks and inline code
    .replace(/(`{1,3})([^`]+)\1/g, '$2')
    // 7. Remove images ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // 8. Trim extra whitespace
    .replace(/\n+/g, ' ')
    .trim()
}
