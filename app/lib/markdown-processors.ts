import { getAnonymousUsername } from '@/lib/anonymous-usernames'
import { truncate } from './utils/formatting'

/**
 * Extracts unique mention IDs stored as @{uuid} from markdown.
 */
export function extractMentionIds(markdown: string): string[] {
  if (!markdown)
    return []

  const mentionIdPatternBraced = /@\{([0-9a-f-]{36})\}/gi
  const mentionIdPatternLegacy = /@([0-9a-f-]{36})/gi
  const ids = new Set<string>()

  for (const match of markdown.matchAll(mentionIdPatternBraced)) {
    const id = match[1]
    if (typeof id === 'string' && id.trim() !== '') {
      ids.add(id.toLowerCase())
    }
  }

  for (const match of markdown.matchAll(mentionIdPatternLegacy)) {
    const id = match[1]
    if (typeof id === 'string' && id.trim() !== '') {
      ids.add(id.toLowerCase())
    }
  }

  return Array.from(ids)
}

/**
 * Processes markdown text to convert @username mentions into proper markdown links
 * @param markdown The markdown content to process
 * @returns The processed markdown with mentions converted to links
 */
export function processMentions(markdown: string): string {
  if (!markdown)
    return ''

  // Pattern to match mention IDs stored as @{uuid}
  const mentionIdPatternBraced = /@\{([0-9a-f-]{36})\}/gi
  const mentionIdPatternLegacy = /@([0-9a-f-]{36})/gi

  const resolvedMarkdown = markdown
    .replace(mentionIdPatternBraced, (_match, id: string) => {
      return `<SharedUserMention user-id="${id}"></SharedUserMention>`
    })
    .replace(mentionIdPatternLegacy, (_match, id: string) => {
      return `<SharedUserMention user-id="${id}"></SharedUserMention>`
    })

  return resolvedMarkdown
}

/**
 * Processes markdown text to convert @mentions to plain text usernames
 * @param markdown The markdown content to process
 * @param mentionIdToUsername Lookup map for mention IDs to usernames
 * @returns The processed text with mentions converted to @Username
 */
export function processMentionsToText(markdown: string, mentionIdToUsername: Record<string, string> = {}): string {
  if (!markdown)
    return ''

  // Pattern to match mention IDs stored as @{uuid}
  const mentionIdPatternBraced = /@\{([0-9a-f-]{36})\}/gi
  const mentionIdPatternLegacy = /@([0-9a-f-]{36})/gi
  const normalizedMentionLookup = Object.fromEntries(
    Object.entries(mentionIdToUsername).map(([id, username]) => [id.toLowerCase(), username]),
  )

  const replaceCallback = (_match: string, id: string) => {
    const resolvedUsername = normalizedMentionLookup[id.toLowerCase()]

    if (typeof resolvedUsername === 'string' && resolvedUsername.trim() !== '' && isValidMentionUsername(resolvedUsername)) {
      return `@${resolvedUsername}`
    }

    const anonymousUsername = getAnonymousUsername(id)
    if (isValidMentionUsername(anonymousUsername)) {
      return `@${anonymousUsername}`
    }

    return `@${id}`
  }

  return markdown
    .replace(mentionIdPatternBraced, replaceCallback)
    .replace(mentionIdPatternLegacy, replaceCallback)
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
 * @param truncateAmount (optional) Optionally truncate the string to make the operation less expensive
 */
export function stripMarkdown(content?: string | null, truncateAmount = 0) {
  if (typeof content !== 'string' || content.trim() === '') {
    return ''
  }

  if (truncateAmount) {
    content = truncate(content, truncateAmount)
  }

  return content
    // 1. Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // 2. Normalize non-breaking spaces
    .replace(/&nbsp;/g, ' ')
    // 3. Remove horizontal rules
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

/**
 * @param markdownText Original text
 * @returns Returns the markdown input wrapped in blockquotes
 */
export function wrapInBlockquote(markdownText: string) {
  return markdownText
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n')
}
