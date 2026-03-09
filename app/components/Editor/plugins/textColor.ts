import type { JSONContent, MarkdownLexerConfiguration, MarkdownParseHelpers, MarkdownParseResult, MarkdownRendererHelpers, MarkdownToken, MarkdownTokenizer, RenderContext } from '@tiptap/core'
import { Mark, mergeAttributes } from '@tiptap/core'

// ---------------------------------------------------------------------------
// Hex color validation
// ---------------------------------------------------------------------------

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i

function isValidHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value)
}

// ---------------------------------------------------------------------------
// TipTap Mark extension
// ---------------------------------------------------------------------------

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textColor: {
      /** Apply a hex color to the selected text, e.g. "#ff0000". */
      setTextColor: (color: string) => ReturnType
      /** Remove the text color mark from the selection. */
      unsetTextColor: () => ReturnType
    }
  }
}

export const TextColor = Mark.create({
  name: 'textColor',

  // Lower priority than standard marks (bold, italic, etc.)
  priority: 900,

  // ---------------------------------------------------------------------------
  // Attributes
  // ---------------------------------------------------------------------------

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const raw = element.style.color ?? null
          if (raw === null || raw.trim() === '')
            return null
          // Normalise to lowercase hex; reject anything that isn't a plain
          // #rrggbb value to avoid storing arbitrary CSS expressions.
          const normalised = raw.trim().toLowerCase()
          if (isValidHexColor(normalised))
            return normalised
          return null
        },
        renderHTML: (attributes: Record<string, unknown>) => {
          const color = attributes.color
          if (typeof color !== 'string' || !isValidHexColor(color))
            return {}
          return { style: `color: ${color}` }
        },
      },
    }
  },

  // ---------------------------------------------------------------------------
  // HTML (ProseMirror DOM) parsing & rendering
  // ---------------------------------------------------------------------------

  parseHTML() {
    return [
      {
        tag: 'span',
        getAttrs: (node: HTMLElement) => {
          const raw = node.style.color
          if (!raw || raw.trim() === '')
            return false
          const normalised = raw.trim().toLowerCase()
          return isValidHexColor(normalised) ? { color: normalised } : false
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
      setTextColor:
        (color: string) =>
          ({ commands }) => {
            if (!isValidHexColor(color))
              return false
            return commands.setMark(this.name, { color: color.toLowerCase() })
          },

      unsetTextColor:
        () =>
          ({ commands }) =>
            commands.unsetMark(this.name),
    }
  },

  // ---------------------------------------------------------------------------
  // Markdown serialization
  // Serializes to :::color[#rrggbb]text::: — triple-colon inline directive
  // syntax, consistent with other custom directives in the markdown dialect.
  // ---------------------------------------------------------------------------

  renderMarkdown(node: JSONContent, h: MarkdownRendererHelpers, _ctx: RenderContext): string {
    const color = (node.attrs as Record<string, unknown> | undefined)?.color
    if (typeof color !== 'string' || !isValidHexColor(color))
      return h.renderChildren(node)

    return `:::color[${color}]${h.renderChildren(node)}:::`
  },

  // ---------------------------------------------------------------------------
  // Markdown tokenizer — teaches marked.js to recognise :::color[#rrggbb]text:::
  // ---------------------------------------------------------------------------

  markdownTokenizer: {
    name: 'textColor',
    level: 'inline',

    start(src: string): number {
      const idx = src.indexOf(':::color[')
      return idx === -1 ? -1 : idx
    },

    tokenize(src: string, _tokens: MarkdownToken[], lexer: MarkdownLexerConfiguration): MarkdownToken | undefined {
      // Match :::color[#rrggbb]...:::  — exactly 6 hex digits
      const match = /^:::color\[(#[0-9a-f]{6})\]([\s\S]*?):::/i.exec(src)
      if (!match)
        return undefined

      const color = match[1]?.toLowerCase() ?? ''
      const rawInner = match[2] ?? ''

      if (!isValidHexColor(color))
        return undefined

      return {
        type: 'textColor',
        raw: match[0],
        color,
        // Tokenize inner content as inline tokens so nested marks
        // (bold, italic, mentions, etc.) are preserved.
        tokens: lexer.inlineTokens(rawInner),
      } as unknown as MarkdownToken
    },
  } satisfies MarkdownTokenizer,

  // Must match the tokenizer name so the framework wires up parseMarkdown.
  markdownTokenName: 'textColor',

  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers): MarkdownParseResult {
    const raw = token as unknown as Record<string, unknown>
    const rawColor = typeof raw.color === 'string' ? raw.color.toLowerCase() : ''
    let color: string | null = null
    if (isValidHexColor(rawColor))
      color = rawColor

    const innerTokens = (raw.tokens as MarkdownToken[] | undefined) ?? []
    const content = helpers.parseInline(innerTokens)

    // Fall back to plain inline content if the color is invalid.
    if (color === null)
      return content

    return helpers.applyMark('textColor', content, { color })
  },
})
