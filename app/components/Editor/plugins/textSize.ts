import type { JSONContent, MarkdownLexerConfiguration, MarkdownParseHelpers, MarkdownParseResult, MarkdownRendererHelpers, MarkdownToken, MarkdownTokenizer, RenderContext } from '@tiptap/core'
import { Mark, mergeAttributes } from '@tiptap/core'

const CSS_VAR_SIZE_RE = /var\(--text-size-([a-z]+)\)/
const PREFIX_SIZE_RE = /^:::size\[([a-z]+)\]/i
const OPENING_DIRECTIVE_RE = /^[a-z]+\[/i
const CLOSING_DIRECTIVE_RE = /^[a-z[]/i

// ---------------------------------------------------------------------------
// Named size palette
// ---------------------------------------------------------------------------

// Each name maps to a CSS custom property defined in app/assets/index.scss.
// Named steps are used instead of raw values so the scale can be adjusted
// globally per theme without touching stored content.
export const TEXT_SIZE_NAMES = [
  'xs',
  's',
  'l',
  'xl',
  'xxl',
] as const

export type TextSizeName = (typeof TEXT_SIZE_NAMES)[number]

/** Returns the CSS custom property name for a size, e.g. "l" → "--text-size-l". */
export function textSizeVar(name: TextSizeName): string {
  return `--text-size-${name}`
}

/** Returns the CSS value string for a size, e.g. "l" → "var(--text-size-l)". */
export function textSizeValue(name: TextSizeName): string {
  return `var(${textSizeVar(name)})`
}

function isValidSizeName(value: string): value is TextSizeName {
  return (TEXT_SIZE_NAMES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// TipTap Mark extension
// ---------------------------------------------------------------------------

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textSize: {
      /** Apply a named size step to the selected text, e.g. "xl". */
      setTextSize: (size: TextSizeName) => ReturnType
      /** Remove the text size mark from the selection. */
      unsetTextSize: () => ReturnType
    }
  }
}

export const TextSize = Mark.create({
  name: 'textSize',

  priority: 900,

  // ---------------------------------------------------------------------------
  // Attributes
  // ---------------------------------------------------------------------------

  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const fromAttr = element.getAttribute('data-text-size')
          if (fromAttr !== null && fromAttr !== '' && isValidSizeName(fromAttr))
            return fromAttr

          // Fallback: recover name from a CSS-variable inline style.
          const raw = element.style.fontSize ?? ''
          const varMatch = CSS_VAR_SIZE_RE.exec(raw)
          const varName = varMatch?.[1] ?? null
          if (varName !== null && isValidSizeName(varName))
            return varName

          return null
        },
        renderHTML: (attributes: Record<string, unknown>) => {
          const size = attributes.size
          if (typeof size !== 'string' || !isValidSizeName(size))
            return {}
          return {
            'data-text-size': size,
            'style': `font-size: ${textSizeValue(size)}`,
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
        tag: 'span[data-text-size]',
        getAttrs: (node: HTMLElement) => {
          const size = node.getAttribute('data-text-size')
          if (size !== null && size !== '' && isValidSizeName(size))
            return { size }
          return false
        },
      },
      // Graceful fallback for spans with a CSS-variable font-size style.
      {
        tag: 'span',
        getAttrs: (node: HTMLElement) => {
          const raw = node.style.fontSize
          if (!raw)
            return false
          const varMatch = CSS_VAR_SIZE_RE.exec(raw)
          const name = varMatch?.[1] ?? null
          if (name !== null && isValidSizeName(name))
            return { size: name }
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
      setTextSize:
        (size: TextSizeName) =>
          ({ commands }) => {
            if (!isValidSizeName(size))
              return false
            return commands.setMark(this.name, { size })
          },

      unsetTextSize:
        () =>
          ({ commands }) =>
            commands.unsetMark(this.name),
    }
  },

  // ---------------------------------------------------------------------------
  // Markdown serialization  :::size[name]text:::
  // ---------------------------------------------------------------------------

  renderMarkdown(node: JSONContent, h: MarkdownRendererHelpers, _ctx: RenderContext): string {
    const size = (node.attrs as Record<string, unknown> | undefined)?.size
    if (typeof size !== 'string' || !isValidSizeName(size))
      return h.renderChildren(node)

    return `:::size[${size}]${h.renderChildren(node)}:::`
  },

  markdownTokenizer: {
    name: 'textSize',
    level: 'inline',

    start(src: string): number {
      const idx = src.indexOf(':::size[')
      return idx === -1 ? -1 : idx
    },

    tokenize(src: string, _tokens: MarkdownToken[], lexer: MarkdownLexerConfiguration): MarkdownToken | undefined {
      const prefixMatch = PREFIX_SIZE_RE.exec(src)
      if (!prefixMatch)
        return undefined

      const size = prefixMatch[1]?.toLowerCase() ?? ''
      if (!isValidSizeName(size))
        return undefined

      // Find the closing ::: that matches this opening, accounting for nesting.
      // A plain lazy regex ([\s\S]*?) stops at the first ::: it encounters, which
      // is wrong when directives are stacked (e.g. :::size[xxl]:::font[serif]text::::::).
      // We walk the string and track depth so we always find the correct outer close.
      const contentStart = prefixMatch[0].length
      let depth = 1
      let i = contentStart
      while (i < src.length && depth > 0) {
        if (src[i] === ':' && src[i + 1] === ':' && src[i + 2] === ':') {
          const after = src.slice(i + 3)
          if (OPENING_DIRECTIVE_RE.test(after)) {
            // Another opening directive - go deeper
            depth++
            i += 3
            continue
          }
          // Closing ::: - anything NOT followed by a letter or '[' counts,
          // including being followed by another ':' (which is the next closing :::).
          if (!CLOSING_DIRECTIVE_RE.test(after)) {
            depth--
            if (depth === 0) {
              const rawInner = src.slice(contentStart, i)
              const raw = src.slice(0, i + 3)
              return {
                type: 'textSize',
                raw,
                size,
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

  markdownTokenName: 'textSize',

  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers): MarkdownParseResult {
    const raw = token as unknown as Record<string, unknown>
    const rawSize = typeof raw.size === 'string' ? raw.size.toLowerCase() : ''
    const size: TextSizeName | null = isValidSizeName(rawSize) ? rawSize : null

    const innerTokens = (raw.tokens as MarkdownToken[] | undefined) ?? []
    const content = helpers.parseInline(innerTokens)

    if (size === null)
      return content

    return helpers.applyMark('textSize', content, { size })
  },
})
