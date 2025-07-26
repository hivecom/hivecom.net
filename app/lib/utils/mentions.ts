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
