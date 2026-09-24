import { getAnonymousUsername } from '@/lib/anonymousUsernames'
import { truncate } from './utils/formatting'

// ---------------------------------------------------------------------------
// Module-scope regex constants
// ------------------------------------------------------------------------
const TIPTAP_ATTR_RE = /(\w+)="([^"]*)"/g
const YOUTUBE_SHORT_RE = /youtu\.be\/([^?&\s]+)/
const YOUTUBE_ID_RE = /(?:[?&]v=|\/shorts\/)([\w-]+)/
const YOUTUBE_DIRECTIVE_RE = /:::youtube(?:\s+\{([^}]*)\})?\s*:::/g
const VIDEO_DIRECTIVE_RE = /:::video(?:\s+\{([^}]*)\})?\s*:::/g
const AUDIO_DIRECTIVE_RE = /:::audio(?:\s+\{([^}]*)\})?\s*:::/g
const MENTION_BRACED_RE = /@\{([0-9a-f-]{36})\}/gi
const MENTION_LEGACY_RE = /@([0-9a-f-]{36})/gi
const COLOR_TAG_RE = /:::color\[([a-z-]+)\]([\s\S]*?):::(?![a-z-]+\[)/gi
const FONT_TAG_RE = /:::font\[([a-z]+)\]([\s\S]*?):::(?![a-z-]+\[)/gi
const SIZE_TAG_RE = /:::size\[([a-z]+)\]([\s\S]*?):::(?![a-z-]+\[)/gi
const COLON_COMPONENT_RE = /(^|[ \t\n]):([A-Z][A-Z0-9-]*)/gim
const WORD_ONLY_RE = /^\w+$/
const DETAILS_WORD_AFTER_RE = /^(\w*)/
const DATAFILE_DIRECTIVE_RE = /:::dataFile(?:\s+\{([^}]*)\})?\s*:::/g
const CHANNEL_MENTION_RE = /(?<![`\w#])#([a-z][\w-]*)/gi

// A $ followed by a digit is currency. Escape it before remark-math reads it as
// an inline math delimiter.
const CURRENCY_DOLLAR_RE = /\$(?=\d)/g
const ORDERED_LIST_ITEM_RE = /^(\d+)\.\s/
const UNORDERED_SUB_ITEM_RE = /^(\s+)([-*+]\s)/
const FENCED_CODE_RE = /^```/
const STRIP_YOUTUBE_RE = /:::youtube(?:\s+\{[^}]*\})?\s*:::/g
const STRIP_VIDEO_RE = /:::video(?:\s+\{[^}]*\})?\s*:::/g
const STRIP_AUDIO_RE = /:::audio(?:\s+\{[^}]*\})?\s*:::/g
const STRIP_DATAFILE_RE = /:::dataFile(?:\s+\{[^}]*\})?\s*:::/g

const DETAILS_SUMMARY_RE = /:::detailsSummary([\s\S]*?):::/
const DETAILS_CONTENT_RE = /:::detailsContent([\s\S]*?):::/
const STRIP_BLOCK_MATH_RE = /\$\$[\s\S]*?\$\$/g
const STRIP_INLINE_MATH_RE = /\$(?!\d|\s)(?:[^$\n]|\n(?!\n))*\$/g
const STRIP_HTML_TAGS_RE = /<[^>]*>/g
const STRIP_NBSP_RE = /&nbsp;/g
const STRIP_HTML_ENTITY_RE = /&([a-z]+|#x?[0-9a-f]+);/gi
const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: '\'',
}
function decodeHtmlEntities(str: string): string {
  return str.replace(STRIP_HTML_ENTITY_RE, (match, entity: string) => {
    const lower = entity.toLowerCase()
    if (lower in HTML_ENTITY_MAP)
      return HTML_ENTITY_MAP[lower]!
    if (lower.startsWith('#x'))
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
    if (lower.startsWith('#'))
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10))

    return match
  })
}
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
const DETECT_AUDIO_RE = /:::audio(?:\s+\{[^}]*\})?\s*:::/
const DETECT_DATAFILE_RE = /:::dataFile(?:\s+\{[^}]*\})?\s*:::/
const DETECT_MATH_RE = /\$\$[\s\S]*?\$\$|\$(?!\d|\s)(?:[^$\n]|\n(?!\n))*\$/
const DETECT_TABLE_RE = /^\s*\|(?:[^\n|]+\|)+\s*$/m
const DETECT_DETAILS_RE = /:::details\b/

const CODE_FENCE_RE = /^[ \t]*(`{3,}|~{3,})/
const INLINE_CODE_SPAN_RE = /(`+)[^`]*\1(?!`)/g

// ---------------------------------------------------------------------------
// Code-aware text rewriting
// ------------------------------------------------------------------------
/**
 * Runs `transform` over every stretch of `markdown` outside fenced code blocks
 * and inline code spans. Entities are literal inside code, so a blanket
 * `<` -> `&lt;` pass would show a visible `&lt;` in every code sample.
 */
export function replaceOutsideCode(markdown: string, transform: (text: string) => string): string {
  if (!markdown)
    return markdown

  let openFence: string | null = null

  const lines = markdown.split('\n').map((line) => {
    const fence = CODE_FENCE_RE.exec(line)?.[1]

    // A block only closes on a fence of the same character that's at least as
    // long as the opener.
    if (openFence) {
      if (fence && fence[0] === openFence[0] && fence.length >= openFence.length)
        openFence = null

      return line
    }

    if (fence) {
      openFence = fence
      return line
    }

    let out = ''
    let cursor = 0

    for (const span of line.matchAll(INLINE_CODE_SPAN_RE)) {
      out += transform(line.slice(cursor, span.index)) + span[0]
      cursor = span.index + span[0].length
    }

    return out + transform(line.slice(cursor))
  })

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// YouTube directive pre-processor
// ------------------------------------------------------------------------
// Only double-quoted values are supported, which is all TipTap's
// `serializeAttributes` emits.
// Directive attribute values come straight from user markdown and get
// interpolated into raw HTML, so they're escaped at every emit site.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function parseTiptapAttrs(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {}

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

// Returns a youtube-nocookie.com embed URL, or null if `src` isn't a YouTube URL.
function youtubeUrlToEmbedUrl(src: string, start?: string): string | null {
  if (!src)
    return null

  if (src.includes('/embed/'))
    return src

  const shortMatch = src.match(YOUTUBE_SHORT_RE)
  const shortId = shortMatch?.[1] ?? ''
  if (shortId) {
    const startParam = start != null && Number(start) > 0 ? `?start=${start}` : ''
    return `https://www.youtube-nocookie.com/embed/${shortId}${startParam}`
  }

  const idMatch = src.match(YOUTUBE_ID_RE)
  const videoId = idMatch?.[1] ?? ''
  if (videoId) {
    const startParam = start != null && Number(start) > 0 ? `?start=${start}` : ''
    return `https://www.youtube-nocookie.com/embed/${videoId}${startParam}`
  }

  return null
}

/**
 * Converts TipTap's nested `:::details` directives into native
 * `<details>/<summary>` so remark-mdc passes them through as raw HTML instead
 * of resolving unknown block components.
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
  // A regex can't pair the outer closing ::: with its opener because the nested
  // blocks have their own closers, so this counts depth instead.
  const result: string[] = []
  let i = 0

  while (i < markdown.length) {
    const openIdx = markdown.indexOf(':::details', i)
    if (openIdx === -1) {
      result.push(markdown.slice(i))
      break
    }

    result.push(markdown.slice(i, openIdx))

    // ::: followed by word characters opens a block, a bare ::: closes one.
    let depth = 1
    let pos = openIdx + ':::details'.length

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

// `:::video {src="URL" width="640" height="360"} :::` to a raw <video> block.
// Must run before the markdown reaches `<MDC>`.
export function processVideoDirectives(markdown: string): string {
  const DIRECTIVE = VIDEO_DIRECTIVE_RE

  return markdown.replace(DIRECTIVE, (_full, attrString: string = '') => {
    const attrs = parseTiptapAttrs(attrString)
    const src = attrs.src ?? ''

    if (!src)
      return ''

    return `\n<div class="md-video-embed"><video src="${escapeHtml(src)}" controls></video></div>\n`
  })
}

// `:::audio {src="URL"} :::` to a raw <audio> block, which MarkdownRendererInner
// maps to AudioPlayer. Must run before the markdown reaches `<MDC>`.
export function processAudioDirectives(markdown: string): string {
  return markdown.replace(AUDIO_DIRECTIVE_RE, (_full, attrString: string = '') => {
    const attrs = parseTiptapAttrs(attrString)
    const src = attrs.src ?? ''

    if (!src)
      return ''

    return `\n<div class="md-audio-embed"><audio src="${escapeHtml(src)}"></audio></div>\n`
  })
}

// `:::dataFile {src="..." name="..." type="csv"} :::` to a raw HTML attachment
// card. Must run before the markdown reaches `<MDC>`.
export function processDataFileDirectives(markdown: string): string {
  return markdown.replace(DATAFILE_DIRECTIVE_RE, (_full, attrString: string = '') => {
    const attrs = parseTiptapAttrs(attrString)
    const src = attrs.src ?? ''
    const type = attrs.type === 'json' ? 'json' : attrs.type === 'archive' ? 'archive' : 'csv'
    const name = attrs.name ?? (type === 'json' ? 'data.json' : type === 'archive' ? 'archive.zip' : 'data.csv')
    const icon = type === 'json' ? '{ }' : type === 'archive' ? '🗜' : '⊞'

    if (!src)
      return ''

    return `\n<div class="md-datafile-card" data-type="${type}"><span class="md-datafile-card__icon">${icon}</span><span class="md-datafile-card__name">${escapeHtml(name)}</span><a class="md-datafile-card__link" href="${escapeHtml(src)}" target="_blank" rel="noopener noreferrer">Download</a></div>\n`
  })
}

/**
 * `:::youtube {src="URL" width="640" height="360" start="0"} :::` to a raw
 * iframe block. Must run before the markdown reaches `<MDC>`. TipTap's syntax
 * isn't MDC's `:::name{props}` container syntax, so a content component can't
 * handle it.
 */
export function processYoutubeDirectives(markdown: string): string {
  const DIRECTIVE = YOUTUBE_DIRECTIVE_RE

  return markdown.replace(DIRECTIVE, (_full, attrString: string = '') => {
    const attrs = parseTiptapAttrs(attrString)
    const embedUrl = youtubeUrlToEmbedUrl(attrs.src ?? '', attrs.start)

    if (embedUrl == null)
      return ''

    const width = attrs.width ?? '640'
    const height = attrs.height ?? '360'

    // remark only treats this as an HTML block with the block-level div and
    // the surrounding newlines.
    return `\n<div class="md-youtube-embed"><iframe src="${escapeHtml(embedUrl)}" width="${escapeHtml(width)}" height="${escapeHtml(height)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>\n`
  })
}

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

// ---------------------------------------------------------------------------
// Color tag pre-processor
// ------------------------------------------------------------------------
// Must match the textColor plugin's palette and the CSS custom properties in
// app/assets/index.scss.
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
 * Converts :::color[name]text::: into an inline span. Only names in
 * TEXT_COLOR_NAMES pass, so no arbitrary CSS can be injected through the
 * style attribute. The data attribute lets TipTap round-trip the name.
 * Nesting isn't supported: the outer directive wins.
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
// ------------------------------------------------------------------------
const TEXT_FONT_NAMES = new Set([
  'sans',
  'serif',
  'mono',
  'cursive',
  'fantasy',
])

// Allowlisted like processColorTags, so no arbitrary CSS reaches the style attribute.
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
// ------------------------------------------------------------------------
const TEXT_SIZE_NAMES = new Set([
  'xs',
  's',
  'l',
  'xl',
  'xxl',
])

// Allowlisted like processColorTags, so no arbitrary CSS reaches the style attribute.
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

/**
 * CommonMark nests a sub-item only if it's indented to the parent's content
 * column, so `1. ` needs 3 spaces. TipTap emits 2, which remark reads as a new
 * top-level list. This pads under-indented sub-items to the right depth.
 */
function normalizeListIndentation(markdown: string): string {
  const lines = markdown.split('\n')
  const result: string[] = []

  const indentStack: number[] = []
  let inFencedCode = false

  for (const line of lines) {
    if (FENCED_CODE_RE.test(line)) {
      inFencedCode = !inFencedCode
      result.push(line)
      continue
    }
    if (inFencedCode) {
      result.push(line)
      continue
    }

    const orderedMatch = ORDERED_LIST_ITEM_RE.exec(line)
    if (orderedMatch) {
      const requiredChildIndent = orderedMatch[1]!.length + 2 // digits + ". "
      indentStack.push(requiredChildIndent)
      result.push(line)
      continue
    }

    const unorderedMatch = UNORDERED_SUB_ITEM_RE.exec(line)
    if (unorderedMatch && indentStack.length > 0) {
      const currentIndent = unorderedMatch[1]!.length
      const requiredIndent = indentStack[indentStack.length - 1]!
      if (currentIndent < requiredIndent) {
        result.push(' '.repeat(requiredIndent) + unorderedMatch[2]! + line.slice(unorderedMatch[0].length))
        continue
      }
    }

    // TipTap emits "  1. Nested" (2 spaces) under "1. Parent", which needs 3.
    const nestedOrderedMatch = /^(\s+)(\d+\.\s)/.exec(line)
    if (nestedOrderedMatch && indentStack.length > 0) {
      const currentIndent = nestedOrderedMatch[1]!.length
      const requiredIndent = indentStack[indentStack.length - 1]!
      if (currentIndent < requiredIndent) {
        result.push(' '.repeat(requiredIndent) + nestedOrderedMatch[2]! + line.slice(nestedOrderedMatch[0].length))
        continue
      }
    }

    // An unindented, non-blank line ends the list.
    if (line.trim().length > 0 && !/^\s/.test(line)) {
      indentStack.length = 0
    }

    result.push(line)
  }

  return result.join('\n')
}

export function processMarkdown(markdown: string): string {
  if (!markdown)
    return ''

  markdown = normalizeListIndentation(markdown)

  markdown = markdown.replace(CURRENCY_DOLLAR_RE, '\\$')

  // TipTap directives become raw HTML before MDC sees syntax it can't parse.
  markdown = processDetailsDirectives(markdown)

  markdown = processYoutubeDirectives(markdown)

  markdown = processVideoDirectives(markdown)

  markdown = processAudioDirectives(markdown)

  markdown = processDataFileDirectives(markdown)

  markdown = processColorTags(markdown)

  markdown = processFontTags(markdown)

  markdown = processSizeTags(markdown)

  const mentionIdPatternBraced = MENTION_BRACED_RE
  const mentionIdPatternLegacy = MENTION_LEGACY_RE

  const resolvedMarkdown = markdown
    // remark-mdc reads any `:word` as an inline component, even `:D`, and drops
    // unknown ones, eating emoticons. Escape the colon. This must run before the
    // mention substitution: a lookahead to skip `:shared-user-mention{...}` gets
    // defeated by backtracking.
    .replace(COLON_COMPONENT_RE, '$1\\:$2')
    .replace(mentionIdPatternBraced, (_match, id: string) => {
      // Inline :name{} syntax on purpose. A raw <SharedUserMention> at line start
      // becomes a block component that swallows the rest of the line.
      return `:shared-user-mention{user-id="${id}"}`
    })
    .replace(mentionIdPatternLegacy, (_match, id: string) => {
      return `:shared-user-mention{user-id="${id}"}`
    })

  // #channel becomes a mention component everywhere except code, where it has
  // to stay literal.
  return replaceOutsideCode(resolvedMarkdown, text =>
    text.replace(CHANNEL_MENTION_RE, (_match, name: string) => `:shared-channel-mention{channel="${name}"}`))
}

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

export function isValidMentionUsername(username: string): boolean {
  // Keep in step with the username rule in ProfileForm.
  return WORD_ONLY_RE.test(username) && username.length <= 32
}

/**
 * Strips markdown from a content leaving only the strings.
 *
 * @param content Content to strip markdown out of
 * @param truncateAmount (optional) Optionally truncate the string to make the operation less expensive
 */
// Matches only the innermost directive (content can't contain `:::`), so
// stripInlineDirectives peels nested ones one layer per pass.
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

  // Turn :::details into HTML so the summary and body survive as text once the
  // tags are stripped below.
  content = processDetailsDirectives(content)

  content = stripInlineDirectives(content)

  let stripped = content
    .replace(STRIP_YOUTUBE_RE, '')

    .replace(STRIP_VIDEO_RE, '')

    .replace(STRIP_AUDIO_RE, '')

    .replace(STRIP_DATAFILE_RE, '')

    .replace(STRIP_BLOCK_MATH_RE, '')

    // Skips lone $ signs like currency $5.
    .replace(STRIP_INLINE_MATH_RE, '')

    // 1. Remove HTML tags
    .replace(STRIP_HTML_TAGS_RE, '')

  // TipTap HTML stored in the DB leaves entities like &gt; behind.
  stripped = decodeHtmlEntities(stripped)

  return stripped
    .replace(STRIP_NBSP_RE, ' ')

    .replace(STRIP_HR_RE, '')

    .replace(STRIP_HEADERS_RE, '')

    .replace(STRIP_BLOCKQUOTE_RE, '')

    .replace(STRIP_LIST_MARKERS_RE, '')

    .replace(STRIP_BOLD_ITALIC_RE, '$2')

    .replace(STRIP_LINKS_RE, '$1')

    .replace(STRIP_CODE_RE, '$2')

    .replace(STRIP_IMAGES_RE, '$1')

    .replace(STRIP_NEWLINES_RE, ' ')
    .trim()
}

// Drops every :::details block with its nested sub-blocks, leaving only text
// outside spoilers.
function stripDetailsBlocks(markdown: string): string {
  const result: string[] = []
  let i = 0

  while (i < markdown.length) {
    const openIdx = markdown.indexOf(':::details', i)
    if (openIdx === -1) {
      result.push(markdown.slice(i))
      break
    }

    result.push(markdown.slice(i, openIdx))

    const nlAfterOpen = markdown.indexOf('\n', openIdx + ':::details'.length)
    if (nlAfterOpen === -1)
      break

    let pos = nlAfterOpen + 1
    let depth = 1
    let closePos = -1

    while (pos < markdown.length && depth > 0) {
      const nextTriple = markdown.indexOf(':::', pos)
      if (nextTriple === -1)
        break

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

    if (closePos === -1)
      break

    i = closePos + 3
  }

  return result.join('')
}

/**
 * Plain-text preview for compact UI. Strips before truncating so a cut never
 * leaves a broken partial pattern. Never empty: content that was all media
 * falls back to a label like `#image`. `maxLength` applies after stripping,
 * and 0 means no limit.
 */
export function formatMarkdownPreview(
  markdown: string | null | undefined,
  mentionLookup: Record<string, string> = {},
  maxLength = 0,
): string {
  if (markdown === null || markdown === undefined || markdown.trim() === '')
    return '#empty'

  const processed = processMentionsToText(markdown, mentionLookup)

  // Spoiler text never leaks into a preview. Show only what's outside the
  // spoiler, or the label if nothing is.
  if (DETECT_DETAILS_RE.test(markdown)) {
    const outsideSpoiler = stripDetailsBlocks(markdown).trim()
    if (!outsideSpoiler || !stripMarkdown(processMentionsToText(outsideSpoiler, mentionLookup)))
      return '#spoiler'

    return formatMarkdownPreview(outsideSpoiler, mentionLookup, maxLength)
  }

  if (DETECT_TABLE_RE.test(markdown))
    return '#table'

  const stripped = stripMarkdown(processed)

  if (stripped) {
    return maxLength > 0 ? stripped.slice(0, maxLength) : stripped
  }

  if (DETECT_IMAGE_RE.test(markdown))
    return '#image'

  if (DETECT_LINK_RE.test(markdown))
    return '#link'

  if (DETECT_YOUTUBE_RE.test(markdown))
    return '#youtube'

  if (DETECT_VIDEO_RE.test(markdown))
    return '#video'

  if (DETECT_AUDIO_RE.test(markdown))
    return '#audio'

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
