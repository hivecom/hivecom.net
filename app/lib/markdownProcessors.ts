import { getAnonymousUsername } from '@/lib/anonymousUsernames'
import { truncate } from './utils/formatting'

// ---------------------------------------------------------------------------
// Module-scope regex constants
// ---------------------------------------------------------------------------

const TIPTAP_ATTR_RE = /(\w+)="([^"]*)"/g
const YOUTUBE_SHORT_RE = /youtu\.be\/([^?&\s]+)/
const YOUTUBE_ID_RE = /(?:[?&]v=|\/shorts\/)([\w-]+)/
const YOUTUBE_DIRECTIVE_RE = /:::youtube(?:\s+\{([^}]*)\})?\s*:::/g
const VIDEO_DIRECTIVE_RE = /:::video(?:\s+\{([^}]*)\})?\s*:::/g
const MENTION_BRACED_RE = /@\{([0-9a-f-]{36})\}/gi
const MENTION_LEGACY_RE = /@([0-9a-f-]{36})/gi
const COLOR_TAG_RE = /:::color\[([a-z-]+)\]([\s\S]*?):::(?![a-z-]+\[)/gi
const FONT_TAG_RE = /:::font\[([a-z]+)\]([\s\S]*?):::(?![a-z-]+\[)/gi
const SIZE_TAG_RE = /:::size\[([a-z]+)\]([\s\S]*?):::(?![a-z-]+\[)/gi
const COLON_COMPONENT_RE = /(^|[ \t\n]):([A-Z][A-Z0-9-]*)/gim
const WORD_ONLY_RE = /^\w+$/
const DETAILS_WORD_AFTER_RE = /^(\w*)/
const DATAFILE_DIRECTIVE_RE = /:::dataFile(?:\s+\{([^}]*)\})?\s*:::/g
const STRIP_YOUTUBE_RE = /:::youtube(?:\s+\{[^}]*\})?\s*:::/g
const STRIP_VIDEO_RE = /:::video(?:\s+\{[^}]*\})?\s*:::/g
const STRIP_DATAFILE_RE = /:::dataFile(?:\s+\{[^}]*\})?\s*:::/g

const DETAILS_SUMMARY_RE = /:::detailsSummary([\s\S]*?):::/
const DETAILS_CONTENT_RE = /:::detailsContent([\s\S]*?):::/
const STRIP_BLOCK_MATH_RE = /\$\$[\s\S]*?\$\$/g
const STRIP_INLINE_MATH_RE = /\$(?!\d|\s)(?:[^$\n]|\n(?!\n))*\$/g
const STRIP_HTML_TAGS_RE = /<[^>]*>/g
const STRIP_NBSP_RE = /&nbsp;/g
const STRIP_HR_RE = /^---/gm
const STRIP_HEADERS_RE = /^#+\s+/gm
const STRIP_BLOCKQUOTE_RE = /^>\s*/gm
const STRIP_LIST_MARKERS_RE = /^[-*]\s+/gm
const STRIP_BOLD_ITALIC_RE = /([*_]{1,3})(\S.*?\S?)\1/g
const STRIP_LINKS_RE = /\[([^\]]+)\]\([^)]+\)/g
const STRIP_CODE_RE = /(`{1,3})([^`]+)\1/g
const STRIP_IMAGES_RE = /!\[([^\]]*)\]\([^)]+\)/g
const STRIP_NEWLINES_RE = /\n+/g
const DETECT_IMAGE_RE = /!\[.*?\]\(.*?\)/
const DETECT_LINK_RE = /\[.*?\]\(.*?\)/
const DETECT_YOUTUBE_RE = /:::youtube(?:\s+\{[^}]*\})?\s*:::/
const DETECT_VIDEO_RE = /:::video(?:\s+\{[^}]*\})?\s*:::/
const DETECT_DATAFILE_RE = /:::dataFile(?:\s+\{[^}]*\})?\s*:::/
const DETECT_MATH_RE = /\$\$[\s\S]*?\$\$|\$(?!\d|\s)(?:[^$\n]|\n(?!\n))*\$/
const DETECT_TABLE_RE = /^\s*\|(?:[^\n|]+\|)+\s*$/m
const DETECT_DETAILS_RE = /:::details\b/

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
  const attrPattern = TIPTAP_ATTR_RE
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
  const shortMatch = src.match(YOUTUBE_SHORT_RE)
  const shortId = shortMatch?.[1] ?? ''
  if (shortId) {
    const startParam = start != null && Number(start) > 0 ? `?start=${start}` : ''
    return `https://www.youtube-nocookie.com/embed/${shortId}${startParam}`
  }

  // Standard watch URLs (v=…) and /shorts/
  const idMatch = src.match(YOUTUBE_ID_RE)
  const videoId = idMatch?.[1] ?? ''
  if (videoId) {
    const startParam = start != null && Number(start) > 0 ? `?start=${start}` : ''
    return `https://www.youtube-nocookie.com/embed/${videoId}${startParam}`
  }

  return null
}

/**
 * Converts TipTap's `:::details` / `:::detailsSummary` / `:::detailsContent`
 * nested block directives into native HTML `<details>/<summary>` elements so
 * that remark-mdc passes them through as raw HTML instead of trying to resolve
 * unknown block components.
 *
 * Serialized format (from @tiptap/markdown createBlockMarkdownSpec):
 *
 *   :::details
 *
 *   :::detailsSummary
 *
 *   Title text
 *
 *   :::
 *
 *   :::detailsContent
 *
 *   Body content
 *
 *   :::
 *
 *   :::
 */
export function processDetailsDirectives(markdown: string): string {
  // Regex-based approaches fail because the outer :::details block contains
  // nested :::detailsSummary and :::detailsContent blocks, each with their own
  // closing :::. We use a depth-counting scan instead: find :::details openings,
  // track nesting depth by counting all ::: openers/closers, and extract the
  // full outer block before converting it to native HTML.
  const result: string[] = []
  let i = 0

  while (i < markdown.length) {
    const openIdx = markdown.indexOf(':::details', i)
    if (openIdx === -1) {
      result.push(markdown.slice(i))
      break
    }

    // Push everything before this :::details block unchanged
    result.push(markdown.slice(i, openIdx))

    // Find the matching outer closing ::: by tracking nesting depth.
    // Every ::: followed by word characters opens a new block (depth++).
    // Every bare ::: (no word chars immediately after) closes one (depth--).
    let depth = 1
    let pos = openIdx + ':::details'.length

    // Advance past the rest of the opening line
    const nlAfterOpen = markdown.indexOf('\n', pos)
    if (nlAfterOpen === -1) {
      result.push(markdown.slice(openIdx))
      break
    }
    pos = nlAfterOpen + 1

    let closePos = -1
    while (pos < markdown.length && depth > 0) {
      const nextTriple = markdown.indexOf(':::', pos)
      if (nextTriple === -1)
        break

      // Determine whether this ::: opens (has word chars) or closes (bare)
      const afterTriple = markdown.slice(nextTriple + 3).match(DETAILS_WORD_AFTER_RE)
      const wordAfter = afterTriple?.[1] ?? ''
      if (wordAfter.length > 0) {
        depth++
      }
      else {
        depth--
        if (depth === 0)
          closePos = nextTriple
      }
      pos = nextTriple + 3 + wordAfter.length + 1
    }

    if (closePos === -1) {
      // Unmatched block - pass through as-is
      result.push(markdown.slice(openIdx))
      break
    }

    const inner = markdown.slice(openIdx + ':::details'.length, closePos)

    const summaryMatch = inner.match(DETAILS_SUMMARY_RE)
    const summaryText = summaryMatch?.[1]?.trim() ?? 'Details'

    const contentMatch = inner.match(DETAILS_CONTENT_RE)
    const bodyText = contentMatch?.[1]?.trim() ?? ''

    result.push(`\n<details>\n<summary>${summaryText}</summary>\n\n${bodyText}\n\n</details>\n`)
    i = closePos + 3
  }

  return result.join('')
}

/**
 * Converts TipTap's proprietary `:::video {src="..." ...} :::` directive
 * syntax into an HTML <video> block. Must run before the markdown is handed
 * to `<MDC>`.
 *
 * TipTap format:
 *   :::video {src="URL" width="640" height="360"} :::
 */
export function processVideoDirectives(markdown: string): string {
  const DIRECTIVE = VIDEO_DIRECTIVE_RE

  return markdown.replace(DIRECTIVE, (_full, attrString: string = '') => {
    const attrs = parseTiptapAttrs(attrString)
    const src = attrs.src ?? ''

    if (!src)
      return ''

    const width = attrs.width ?? '640'
    const height = attrs.height ?? '360'

    return `\n<div class="md-video-embed"><video src="${src}" width="${width}" height="${height}" controls></video></div>\n`
  })
}

/**
 * Converts TipTap's `:::dataFile {src="..." name="..." type="csv"} :::` directive
 * into an HTML attachment card block that MDC passes through as raw HTML.
 * Must run before the markdown is handed to `<MDC>`.
 */
export function processDataFileDirectives(markdown: string): string {
  return markdown.replace(DATAFILE_DIRECTIVE_RE, (_full, attrString: string = '') => {
    const attrs = parseTiptapAttrs(attrString)
    const src = attrs.src ?? ''
    const name = attrs.name ?? (attrs.type === 'json' ? 'data.json' : 'data.csv')
    const type = attrs.type === 'json' ? 'json' : 'csv'
    const icon = type === 'json' ? '{ }' : '⊞'

    if (!src)
      return ''

    return `\n<div class="md-datafile-card" data-type="${type}"><span class="md-datafile-card__icon">${icon}</span><span class="md-datafile-card__name">${name}</span><a class="md-datafile-card__link" href="${src}" target="_blank" rel="noopener noreferrer">Download</a></div>\n`
  })
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
  const DIRECTIVE = YOUTUBE_DIRECTIVE_RE

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

  const mentionIdPatternBraced = MENTION_BRACED_RE
  const mentionIdPatternLegacy = MENTION_LEGACY_RE
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

  return [...ids]
}

/**
 * Processes markdown text to convert @username mentions into proper markdown links
 * @param markdown The markdown content to process
 * @returns The processed markdown with mentions converted to links
 */
// ---------------------------------------------------------------------------
// Color tag pre-processor
// ---------------------------------------------------------------------------

// The canonical palette names must match those exported by the textColor plugin
// and the CSS custom properties defined in app/assets/index.scss.
const TEXT_COLOR_NAMES = new Set([
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'teal',
  'blue',
  'indigo',
  'purple',
  'fuchsia',
  'pink',
  'text-invert',
  'text-lightest',
  'text-lighter',
  'text',
])

/**
 * Converts :::color[name]text::: directives into inline HTML spans that
 * MDC / rehype-raw will render as styled text.  Only palette color names
 * defined in TEXT_COLOR_NAMES are accepted; anything else is left untouched
 * so no arbitrary CSS expressions can be injected.
 *
 * The span carries both a data attribute (for the TipTap editor to round-trip
 * the name cleanly) and an inline CSS variable reference (for static renders).
 *
 * Nesting is intentionally not supported - the outer directive wins.
 */
export function processColorTags(markdown: string): string {
  if (!markdown)
    return ''

  return markdown.replace(
    COLOR_TAG_RE,
    (_full, name: string, inner: string) => {
      const colorName = name.toLowerCase()
      if (!TEXT_COLOR_NAMES.has(colorName))
        return _full
      return `<span data-text-color="${colorName}" style="color: var(--text-color-${colorName})">${inner}</span>`
    },
  )
}

// ---------------------------------------------------------------------------
// Font tag pre-processor
// ---------------------------------------------------------------------------

const TEXT_FONT_NAMES = new Set([
  'sans',
  'serif',
  'mono',
  'cursive',
  'fantasy',
])

/**
 * Converts :::font[name]text::: directives into inline HTML spans.
 * Only palette font names defined in TEXT_FONT_NAMES are accepted.
 */
export function processFontTags(markdown: string): string {
  if (!markdown)
    return ''

  return markdown.replace(
    FONT_TAG_RE,
    (_full, name: string, inner: string) => {
      const fontName = name.toLowerCase()
      if (!TEXT_FONT_NAMES.has(fontName))
        return _full
      return `<span data-text-font="${fontName}" style="font-family: var(--text-font-${fontName})">${inner}</span>`
    },
  )
}

// ---------------------------------------------------------------------------
// Size tag pre-processor
// ---------------------------------------------------------------------------

const TEXT_SIZE_NAMES = new Set([
  'xs',
  's',
  'l',
  'xl',
  'xxl',
])

/**
 * Converts :::size[name]text::: directives into inline HTML spans.
 * Only palette size names defined in TEXT_SIZE_NAMES are accepted.
 */
export function processSizeTags(markdown: string): string {
  if (!markdown)
    return ''

  return markdown.replace(
    SIZE_TAG_RE,
    (_full, name: string, inner: string) => {
      const sizeName = name.toLowerCase()
      if (!TEXT_SIZE_NAMES.has(sizeName))
        return _full
      return `<span data-text-size="${sizeName}" style="font-size: var(--text-size-${sizeName})">${inner}</span>`
    },
  )
}

export function processMarkdown(markdown: string): string {
  if (!markdown)
    return ''

  // Convert TipTap details/spoiler directives to native <details> HTML first
  // so that MDC doesn't try to resolve them as unknown block components.
  markdown = processDetailsDirectives(markdown)

  // Convert TipTap YouTube directives to raw HTML iframes first so that MDC
  // doesn't see the `:::youtube` syntax it cannot parse.
  markdown = processYoutubeDirectives(markdown)

  // Convert TipTap video directives to raw HTML <video> blocks.
  markdown = processVideoDirectives(markdown)

  // Convert TipTap dataFile directives to raw HTML attachment cards.
  markdown = processDataFileDirectives(markdown)

  // Convert :::color[name]text::: directives into inline HTML spans.
  markdown = processColorTags(markdown)

  // Convert :::font[name]text::: directives into inline HTML spans.
  markdown = processFontTags(markdown)

  // Convert :::size[name]text::: directives into inline HTML spans.
  markdown = processSizeTags(markdown)

  // Pattern to match mention IDs stored as @{uuid}
  const mentionIdPatternBraced = MENTION_BRACED_RE
  const mentionIdPatternLegacy = MENTION_LEGACY_RE

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
    .replace(COLON_COMPONENT_RE, '$1\\:$2')
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
    .replace(MENTION_BRACED_RE, replaceCallback)
    .replace(MENTION_LEGACY_RE, replaceCallback)
}

/**
 * Validates if a username is valid for mentions
 * @param username The username to validate
 * @returns true if the username is valid for mentions
 */
export function isValidMentionUsername(username: string): boolean {
  // Same validation as in ProfileForm - only letters, numbers, and underscores
  return WORD_ONLY_RE.test(username) && username.length <= 32
}

/**
 * Strips markdown from a content leaving only the strings.
 *
 * @param content Content to strip markdown out of
 * @param truncateAmount (optional) Optionally truncate the string to make the operation less expensive
 */
// Iteratively strips nested :::color/font/size[name]text::: directives, keeping
// only the inner text. The regex matches the innermost directive first by
// requiring that the captured content contains no `:::` sequences - this ensures
// we peel one layer at a time from the inside out, correctly handling arbitrary
// nesting (e.g. :::size[xxl]:::font[serif]text:::::: → Test! in two passes).
const INLINE_DIRECTIVE_RE = /:::(?:color|font|size)\[[a-z0-9#-]+\]((?:(?!:::)[\s\S])*?):::(?![a-z[])/gi

function stripInlineDirectives(s: string): string {
  let prev: string
  do {
    prev = s
    s = s.replace(INLINE_DIRECTIVE_RE, '$1')
  } while (s !== prev)
  return s
}

export function stripMarkdown(content?: string | null, truncateAmount = 0) {
  if (typeof content !== 'string' || content.trim() === '') {
    return ''
  }

  if (truncateAmount) {
    content = truncate(content, truncateAmount)
  }

  // Convert :::details blocks to HTML so the summary label and body text
  // survive as plain text; STRIP_HTML_TAGS_RE below then removes the tags.
  content = processDetailsDirectives(content)

  // 0b-pre. Remove inline directives: :::color/font/size[name]text::: → keep inner text
  // Must run before the chain since it needs iterative application for nested directives.
  content = stripInlineDirectives(content)

  return content
    // 0a. Remove YouTube directives: :::youtube {src="..." ...} :::
    .replace(STRIP_YOUTUBE_RE, '')
    // 0b2. Remove video directives: :::video {src="..." ...} :::
    .replace(STRIP_VIDEO_RE, '')
    // 0b3. Remove data file directives: :::dataFile {src="..." ...} :::
    .replace(STRIP_DATAFILE_RE, '')
    // 0b. Remove block math: $$...$$
    .replace(STRIP_BLOCK_MATH_RE, '')
    // 0c. Remove inline math: $...$  (avoid matching lone $ signs like currency $5)
    .replace(STRIP_INLINE_MATH_RE, '')
    // 1. Remove HTML tags
    .replace(STRIP_HTML_TAGS_RE, '')
    // 2. Normalize non-breaking spaces
    .replace(STRIP_NBSP_RE, ' ')
    // 3. Remove horizontal rules
    .replace(STRIP_HR_RE, '')
    // 4. Remove headers (###)
    .replace(STRIP_HEADERS_RE, '')
    // 5. Remove blockquote markers (> )
    .replace(STRIP_BLOCKQUOTE_RE, '')
    // 6. Remove unordered list markers (- or * at start of line)
    .replace(STRIP_LIST_MARKERS_RE, '')
    // 7. Remove bold/italic (** or __)
    .replace(STRIP_BOLD_ITALIC_RE, '$2')
    // 8. Remove links [text](url) -> "text"
    .replace(STRIP_LINKS_RE, '$1')
    // 9. Remove code blocks and inline code
    .replace(STRIP_CODE_RE, '$2')
    // 10. Remove images ![alt](url)
    .replace(STRIP_IMAGES_RE, '$1')
    // 11. Trim extra whitespace
    .replace(STRIP_NEWLINES_RE, ' ')
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

  // Prioritize details/spoiler detection: if present, always show spoiler preview
  if (DETECT_DETAILS_RE.test(markdown))
    return '#spoiler'

  // Prioritize table detection: if a table is present, always show table preview
  if (DETECT_TABLE_RE.test(markdown))
    return '#table'

  const stripped = stripMarkdown(processed)

  if (stripped) {
    return maxLength > 0 ? stripped.slice(0, maxLength) : stripped
  }

  // Content stripped to nothing - detect what kind of media it was
  if (DETECT_IMAGE_RE.test(markdown))
    return '#image'

  if (DETECT_LINK_RE.test(markdown))
    return '#link'

  if (DETECT_YOUTUBE_RE.test(markdown))
    return '#youtube'

  if (DETECT_VIDEO_RE.test(markdown))
    return '#video'

  if (DETECT_DATAFILE_RE.test(markdown))
    return '#file'

  if (DETECT_MATH_RE.test(markdown))
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
