import { getAnonymousUsername } from '@/lib/anonymous-usernames'
import { truncate } from './utils/formatting'

// ---------------------------------------------------------------------------
// YouTube directive pre-processor
// ---------------------------------------------------------------------------

/**
 * Parses a TipTap attribute string like `src="..." width="640"` into a plain
 * object. Only double-quoted string values are supported (which is all TipTap
 * ever emits from `serializeAttributes`).
 */
function parseTiptapAttrs(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  // Match key="value" pairs (value may be empty)
  const attrPattern = /(\w+)="([^"]*)"/g
  for (const match of attrString.matchAll(attrPattern)) {
    const key = match[1]
    const value = match[2]
    if (typeof key === 'string' && typeof value === 'string') {
      attrs[key] = value
    }
  }
  return attrs
}

/**
 * Converts a plain YouTube watch/share URL (as stored by the TipTap Youtube
 * extension in its `src` attribute) into a youtube-nocookie.com embed URL.
 * Returns `null` if the URL isn't recognised as a YouTube URL.
 */
function youtubeUrlToEmbedUrl(src: string, start?: string): string | null {
  if (!src)
    return null

  // Already an embed URL – use as-is
  if (src.includes('/embed/'))
    return src

  // youtu.be short URLs
  const shortMatch = src.match(/youtu\.be\/([^?&\s]+)/)
  const shortId = shortMatch?.[1] ?? ''
  if (shortId) {
    const startParam = start != null && Number(start) > 0 ? `?start=${start}` : ''
    return `https://www.youtube-nocookie.com/embed/${shortId}${startParam}`
  }

  // Standard watch URLs (v=…) and /shorts/
  const idMatch = src.match(/(?:[?&]v=|\/shorts\/)([\w-]+)/)
  const videoId = idMatch?.[1] ?? ''
  if (videoId) {
    const startParam = start != null && Number(start) > 0 ? `?start=${start}` : ''
    return `https://www.youtube-nocookie.com/embed/${videoId}${startParam}`
  }

  return null
}

/**
 * Converts TipTap's proprietary `:::youtube {src="..." ...} :::` directive
 * syntax into an HTML iframe block that MDC / remark will pass through as raw
 * HTML.  This must run **before** the markdown is handed to `<MDC>`.
 *
 * TipTap's format (from `createAtomBlockMarkdownSpec`):
 *   :::youtube {src="URL" width="640" height="360" start="0"} :::
 *
 * Note: this is NOT the same as MDC's `:::name{props}` container syntax,
 * hence we preprocess it here instead of relying on a content component.
 */
export function processYoutubeDirectives(markdown: string): string {
  // Matches the full `:::youtube { ... } :::` token on a single line
  const DIRECTIVE = /:::youtube(?:\s+\{([^}]*)\})?\s*:::/g

  return markdown.replace(DIRECTIVE, (_full, attrString: string = '') => {
    const attrs = parseTiptapAttrs(attrString)
    const embedUrl = youtubeUrlToEmbedUrl(attrs.src ?? '', attrs.start)

    if (embedUrl == null)
      return ''

    const width = attrs.width ?? '640'
    const height = attrs.height ?? '360'

    // Wrap in a block-level div so remark treats it as an HTML block, not
    // inline HTML. The surrounding blank lines are important for remark to
    // recognise the opening tag as the start of an HTML block.
    return `\n<div class="md-youtube-embed"><iframe src="${embedUrl}" width="${width}" height="${height}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>\n`
  })
}

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
// ---------------------------------------------------------------------------
// Color tag pre-processor
// ---------------------------------------------------------------------------

/**
 * Converts :::color[#rrggbb]text::: directives into inline HTML spans that
 * MDC / rehype-raw will render as styled text.  Only valid 6-digit hex colors
 * are accepted; anything else is left untouched so no arbitrary CSS expressions
 * can be injected.
 *
 * Nesting is intentionally not supported — the outer directive wins.
 */
export function processColorTags(markdown: string): string {
  if (!markdown)
    return ''

  return markdown.replace(
    /:::color\[(#[0-9a-f]{6})\]([\s\S]*?):::/gi,
    (_full, color: string, inner: string) => {
      return `<span style="color: ${color.toLowerCase()}">${inner}</span>`
    },
  )
}

export function processMentions(markdown: string): string {
  if (!markdown)
    return ''

  // Convert TipTap YouTube directives to raw HTML iframes first so that MDC
  // doesn't see the `:::youtube` syntax it cannot parse.
  markdown = processYoutubeDirectives(markdown)

  // Convert :::color[#rrggbb]text::: directives into inline HTML spans.
  markdown = processColorTags(markdown)

  // Pattern to match mention IDs stored as @{uuid}
  const mentionIdPatternBraced = /@\{([0-9a-f-]{36})\}/gi
  const mentionIdPatternLegacy = /@([0-9a-f-]{36})/gi

  const resolvedMarkdown = markdown
    // remark-mdc parses any `:word` sequence (after whitespace or at line start) as an
    // inline component reference, even single-letter names like `:D` or `:C`. Unknown
    // components are silently dropped, eating emoticons and other colon-prefixed text.
    // We escape those patterns with a CommonMark backslash escape (\:) so the colon is
    // treated as a literal character.
    //
    // IMPORTANT: this must run BEFORE the mention substitution below. The mention
    // substitution adds `:shared-user-mention{...}` to the string, and a negative
    // lookahead approach to skip it is defeated by regex backtracking. Running this
    // step first means the source string only contains user-authored text - no
    // `:shared-user-mention{...}` patterns can exist yet - so the simple replacement
    // is safe and correct.
    .replace(/(^|[ \t\n]):([A-Z][A-Z0-9-]*)/gim, '$1\\:$2')
    .replace(mentionIdPatternBraced, (_match, id: string) => {
      // Use MDC inline component syntax (:name{props}) instead of raw HTML tags.
      // When a raw <SharedUserMention> tag starts a line, remark-mdc treats it as a
      // block-level component, consuming all following text on that line as its children
      // and applying block-level (heading-like) styling. The :name{} inline syntax
      // explicitly marks the component as inline, regardless of its position in a paragraph.
      return `:shared-user-mention{user-id="${id}"}`
    })
    .replace(mentionIdPatternLegacy, (_match, id: string) => {
      return `:shared-user-mention{user-id="${id}"}`
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
    // 0a. Remove YouTube directives: :::youtube {src="..." ...} :::
    .replace(/:::youtube(?:\s+\{[^}]*\})?\s*:::/g, '')
    // 0b-pre. Remove color directives: :::color[#rrggbb]text::: → keep inner text
    .replace(/:::color\[#[0-9a-f]{6}\]([\s\S]*?):::/gi, '$1')
    // 0b. Remove block math: $$...$$
    .replace(/\$\$[\s\S]*?\$\$/g, '')
    // 0c. Remove inline math: $...$  (avoid matching lone $ signs like currency $5)
    .replace(/\$(?!\d|\s)(?:[^$\n]|\n(?!\n))*\$/g, '')
    // 1. Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // 2. Normalize non-breaking spaces
    .replace(/&nbsp;/g, ' ')
    // 3. Remove horizontal rules
    .replace(/^---/gm, '')
    // 4. Remove headers (###)
    .replace(/^#+\s+/gm, '')
    // 5. Remove blockquote markers (> )
    .replace(/^>\s*/gm, '')
    // 6. Remove unordered list markers (- or * at start of line)
    .replace(/^[\-*]\s+/gm, '')
    // 7. Remove bold/italic (** or __)
    .replace(/([*_]{1,3})(\S.*?\S?)\1/g, '$2')
    // 8. Remove links [text](url) -> "text"
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // 9. Remove code blocks and inline code
    .replace(/(`{1,3})([^`]+)\1/g, '$2')
    // 10. Remove images ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // 11. Trim extra whitespace
    .replace(/\n+/g, ' ')
    .trim()
}

/**
 * Formats a markdown string into a plain-text preview suitable for display in
 * compact UI elements (activity feeds, profile sections, etc.).
 *
 * - Processes mention UUIDs into readable @username strings first
 * - Strips all markdown syntax (images, links, bold, etc.) before truncating,
 *   avoiding broken partial patterns from early truncation
 * - Falls back to a descriptive label when the entire content was media/links
 *
 * @param markdown Raw markdown content
 * @param mentionLookup Optional map of mention UUID -> username for resolving mentions
 * @param maxLength Optional character limit applied after stripping (default: 0 = no limit)
 * @returns Plain-text preview string, never empty
 */
export function formatMarkdownPreview(
  markdown: string | null | undefined,
  mentionLookup: Record<string, string> = {},
  maxLength = 0,
): string {
  if (markdown === null || markdown === undefined || markdown.trim() === '')
    return '#empty'

  const processed = processMentionsToText(markdown, mentionLookup)
  const stripped = stripMarkdown(processed)

  if (stripped) {
    return maxLength > 0 ? stripped.slice(0, maxLength) : stripped
  }

  // Content stripped to nothing - detect what kind of media it was
  if (/!\[.*?\]\(.*?\)/.test(markdown))
    return '#image'

  if (/\[.*?\]\(.*?\)/.test(markdown))
    return '#link'

  if (/:::youtube(?:\s+\{[^}]*\})?\s*:::/.test(markdown))
    return '#youtube'

  if (/\$\$[\s\S]*?\$\$|\$(?!\d|\s)(?:[^$\n]|\n(?!\n))*\$/.test(markdown))
    return '#math'

  return '#empty'
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
