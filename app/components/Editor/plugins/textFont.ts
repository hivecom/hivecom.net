import type { JSONContent, MarkdownLexerConfiguration, MarkdownParseHelpers, MarkdownParseResult, MarkdownRendererHelpers, MarkdownToken, MarkdownTokenizer, RenderContext } from '@tiptap/core'
import { Mark, mergeAttributes } from '@tiptap/core'

const CSS_VAR_FONT_RE = /var\(--text-font-([a-z]+)\)/
const PREFIX_FONT_RE = /^:::font\[([a-z]+)\]/i
const OPENING_DIRECTIVE_RE = /^[a-z]+\[/i
const CLOSING_DIRECTIVE_RE = /^[a-z[]/i

// ---------------------------------------------------------------------------
// Named font palette
// ---------------------------------------------------------------------------

// Each name maps to a CSS custom property defined in app/assets/index.scss.
// Only system-safe stacks are included so no web fonts need to be loaded.
export const TEXT_FONT_NAMES = [
  'sans',
  'serif',
  'mono',
  'cursive',
  'fantasy',
] as const

export type TextFontName = (typeof TEXT_FONT_NAMES)[number]

/** Returns the CSS custom property name for a font, e.g. "sans" → "--text-font-sans". */
export function textFontVar(name: TextFontName): string {
  return `--text-font-${name}`
}

/** Returns the CSS value string for a font, e.g. "sans" → "var(--text-font-sans)". */
export function textFontValue(name: TextFontName): string {
  return `var(${textFontVar(name)})`
}

function isValidFontName(value: string): value is TextFontName {
  return (TEXT_FONT_NAMES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// TipTap Mark extension
// ---------------------------------------------------------------------------

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textFont: {
      /** Apply a named system font stack to the selected text, e.g. "mono". */
      setTextFont: (font: TextFontName) => ReturnType
      /** Remove the text font mark from the selection. */
      unsetTextFont: () => ReturnType
    }
  }
}

export const TextFont = Mark.create({
  name: 'textFont',

  priority: 900,

  // ---------------------------------------------------------------------------
  // Attributes
  // ---------------------------------------------------------------------------

  addAttributes() {
    return {
      font: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const fromAttr = element.getAttribute('data-text-font')
          if (fromAttr !== null && fromAttr !== '' && isValidFontName(fromAttr))
            return fromAttr

          // Fallback: recover name from a CSS-variable inline style.
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
  // ---------------------------------------------------------------------------

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
      // Graceful fallback for spans with a CSS-variable font-family style.
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
  // ---------------------------------------------------------------------------

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
  // ---------------------------------------------------------------------------

  renderMarkdown(node: JSONContent, h: MarkdownRendererHelpers, _ctx: RenderContext): string {
    const font = (node.attrs as Record<string, unknown> | undefined)?.font
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

      // Find the closing ::: that matches this opening, accounting for nesting.
      // A plain lazy regex ([\s\S]*?) stops at the first ::: it encounters, which
      // is wrong when directives are stacked (e.g. :::font[serif]:::size[xl]text::::::).
      // We walk the string and track depth so we always find the correct outer close.
      const contentStart = prefixMatch[0].length
      let depth = 1
      let i = contentStart
      while (i < src.length && depth > 0) {
        if (src[i] === ':' && src[i + 1] === ':' && src[i + 2] === ':') {
          const after = src.slice(i + 3)
          if (OPENING_DIRECTIVE_RE.test(after)) {
            // Another opening directive — go deeper
            depth++
            i += 3
            continue
          }
          // Closing :::  — anything that is NOT followed by a letter or '[' counts,
          // including being followed by another ':' (which is the next closing :::).
          if (!CLOSING_DIRECTIVE_RE.test(after)) {
            depth--
            if (depth === 0) {
              const rawInner = src.slice(contentStart, i)
              const raw = src.slice(0, i + 3)
              return {
                type: 'textFont',
                raw,
                font,
                tokens: lexer.inlineTokens(rawInner),
              } as unknown as MarkdownToken
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
