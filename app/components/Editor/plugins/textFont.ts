import type { JSONContent, MarkdownLexerConfiguration, MarkdownParseHelpers, MarkdownParseResult, MarkdownRendererHelpers, MarkdownToken, MarkdownTokenizer, RenderContext } from '@tiptap/core'
import { Mark, mergeAttributes } from '@tiptap/core'

const CSS_VAR_FONT_RE = /var\(--text-font-([a-z]+)\)/
const PREFIX_FONT_RE = /^:::font\[([a-z]+)\]/i
const OPENING_DIRECTIVE_RE = /^[a-z]+\[/i

// ---------------------------------------------------------------------------
// Named font palette
// ------------------------------------------------------------------------
// Each name maps to a CSS custom property defined in app/assets/index.scss.
// System stacks only, so no web fonts need loading.
export const TEXT_FONT_NAMES = [
  'sans',
  'serif',
  'mono',
  'cursive',
  'fantasy',
] as const

export type TextFontName = (typeof TEXT_FONT_NAMES)[number]

export function textFontVar(name: TextFontName): string {
  return `--text-font-${name}`
}

export function textFontValue(name: TextFontName): string {
  return `var(${textFontVar(name)})`
}

function isValidFontName(value: string): value is TextFontName {
  return (TEXT_FONT_NAMES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// TipTap Mark extension
// ------------------------------------------------------------------------
declare module '@tiptap/core' {

  // Module augmentation, typescript-eslint 8.69 reports it as unused

  interface Commands<ReturnType> {
    textFont: {
      setTextFont: (font: TextFontName) => ReturnType

      unsetTextFont: () => ReturnType
    }
  }
}

export const TextFont = Mark.create({
  name: 'textFont',

  priority: 900,

  // Typing next to a marked word shouldn't inherit the mark
  inclusive: false,

  // ---------------------------------------------------------------------------
  // Attributes
  // ------------------------------------------------------------------------
  addAttributes() {
    return {
      font: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const fromAttr = element.getAttribute('data-text-font')
          if (fromAttr !== null && fromAttr !== '' && isValidFontName(fromAttr))
            return fromAttr

          // Fall back to a CSS-variable inline style
          const raw = element.style.fontFamily ?? ''
          const varMatch = CSS_VAR_FONT_RE.exec(raw)
          const varName = varMatch?.[1] ?? null
          if (varName !== null && isValidFontName(varName))
            return varName

          return null
        },
        renderHTML: (attributes: Record<string, unknown>) => {
          const font = attributes.font
          if (typeof font !== 'string' || !isValidFontName(font))
            return {}

          return {
            'data-text-font': font,
            'style': `font-family: ${textFontValue(font)}`,
          }
        },
      },
    }
  },

  // ---------------------------------------------------------------------------
  // HTML parsing & rendering
  // ------------------------------------------------------------------------
  parseHTML() {
    return [
      {
        tag: 'span[data-text-font]',
        getAttrs: (node: HTMLElement) => {
          const font = node.getAttribute('data-text-font')
          if (font !== null && font !== '' && isValidFontName(font))
            return { font }

          return false
        },
      },
      // Spans with only a CSS-variable font-family style
      {
        tag: 'span',
        getAttrs: (node: HTMLElement) => {
          const raw = node.style.fontFamily
          if (!raw)
            return false

          const varMatch = CSS_VAR_FONT_RE.exec(raw)
          const name = varMatch?.[1] ?? null
          if (name !== null && isValidFontName(name))
            return { font: name }

          return false
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },

  // ---------------------------------------------------------------------------
  // Commands
  // ------------------------------------------------------------------------
  addCommands() {
    return {
      setTextFont:
        (font: TextFontName) =>
          ({ commands }) => {
            if (!isValidFontName(font))
              return false

            return commands.setMark(this.name, { font })
          },

      unsetTextFont:
        () =>
          ({ commands }) =>
            commands.unsetMark(this.name),
    }
  },

  // ---------------------------------------------------------------------------
  // Markdown serialization  :::font[name]text:::
  // ------------------------------------------------------------------------
  renderMarkdown(node: JSONContent, h: MarkdownRendererHelpers, _ctx: RenderContext): string {
    // eslint-disable-next-line ts/no-unsafe-assignment
    const font = (node.attrs)?.font
    if (typeof font !== 'string' || !isValidFontName(font))
      return h.renderChildren(node)

    return `:::font[${font}]${h.renderChildren(node)}:::`
  },

  markdownTokenizer: {
    name: 'textFont',
    level: 'inline',

    start(src: string): number {
      const idx = src.indexOf(':::font[')
      return idx === -1 ? -1 : idx
    },

    tokenize(src: string, _tokens: MarkdownToken[], lexer: MarkdownLexerConfiguration): MarkdownToken | undefined {
      const prefixMatch = PREFIX_FONT_RE.exec(src)
      if (!prefixMatch)
        return undefined

      const font = prefixMatch[1]?.toLowerCase() ?? ''
      if (!isValidFontName(font))
        return undefined

      // A lazy regex stops at the first :::, which breaks stacked directives
      // like :::font[serif]:::size[xl]text::::::. Track depth to find the outer close.
      const contentStart = prefixMatch[0].length
      let depth = 1
      let i = contentStart
      while (i < src.length && depth > 0) {
        if (src[i] === ':' && src[i + 1] === ':' && src[i + 2] === ':') {
          const after = src.slice(i + 3)
          if (OPENING_DIRECTIVE_RE.test(after)) {
            depth++
            i += 3
            continue
          }

          // Any ::: not followed by `letters[` closes, including text that only looks like a directive
          if (!OPENING_DIRECTIVE_RE.test(after)) {
            depth--
            if (depth === 0) {
              const rawInner = src.slice(contentStart, i)
              const raw = src.slice(0, i + 3)
              return {
                type: 'textFont',
                raw,
                font,
                tokens: lexer.inlineTokens(rawInner),
              }
            }
            i += 3
            continue
          }
        }
        i++
      }

      return undefined
    },
  } satisfies MarkdownTokenizer,

  markdownTokenName: 'textFont',

  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers): MarkdownParseResult {
    const raw = token as unknown as Record<string, unknown>
    const rawFont = typeof raw.font === 'string' ? raw.font.toLowerCase() : ''
    const font: TextFontName | null = isValidFontName(rawFont) ? rawFont : null

    const innerTokens = (raw.tokens as MarkdownToken[] | undefined) ?? []
    const content = helpers.parseInline(innerTokens)

    if (font === null)
      return content

    return helpers.applyMark('textFont', content, { font })
  },
})
