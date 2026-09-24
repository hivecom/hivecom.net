import type { JSONContent, MarkdownLexerConfiguration, MarkdownParseHelpers, MarkdownParseResult, MarkdownRendererHelpers, MarkdownToken, MarkdownTokenizer, RenderContext } from '@tiptap/core'
import { Mark, mergeAttributes } from '@tiptap/core'

const CSS_VAR_COLOR_RE = /var\(--text-color-([a-z-]+)\)/
const PREFIX_COLOR_RE = /^:::color\[([a-z-]+)\]/i
const OPENING_DIRECTIVE_RE = /^[a-z]+\[/i

// ---------------------------------------------------------------------------
// Named color palette
// ------------------------------------------------------------------------
// Allowed color names. Each maps to a CSS custom property in
// app/assets/index.scss, so the hue follows the active theme.
export const TEXT_COLOR_NAMES = [
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
] as const

export type TextColorName = (typeof TEXT_COLOR_NAMES)[number]

export function textColorVar(name: TextColorName): string {
  return `--text-color-${name}`
}

export function textColorValue(name: TextColorName): string {
  return `var(${textColorVar(name)})`
}

function isValidColorName(value: string): value is TextColorName {
  return (TEXT_COLOR_NAMES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// TipTap Mark extension
// ------------------------------------------------------------------------
declare module '@tiptap/core' {

  // Module augmentation, typescript-eslint 8.69 reports it as unused

  interface Commands<ReturnType> {
    textColor: {
      setTextColor: (color: TextColorName) => ReturnType

      unsetTextColor: () => ReturnType
    }
  }
}

export const TextColor = Mark.create({
  name: 'textColor',

  // Above the default 100, so the color span wraps bold, italic and the rest
  priority: 900,

  // Typing next to a marked word shouldn't inherit the mark
  inclusive: false,

  // ---------------------------------------------------------------------------
  // Attributes
  // ------------------------------------------------------------------------
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const fromAttr = element.getAttribute('data-text-color')
          if (fromAttr !== null && fromAttr !== '' && isValidColorName(fromAttr))
            return fromAttr

          // Fall back to a CSS-variable inline style
          const raw = element.style.color ?? ''
          const varMatch = CSS_VAR_COLOR_RE.exec(raw)
          const varName = varMatch?.[1] ?? null
          if (varName !== null && isValidColorName(varName))
            return varName

          return null
        },
        renderHTML: (attributes: Record<string, unknown>) => {
          const color = attributes.color
          if (typeof color !== 'string' || !isValidColorName(color))
            return {}

          return {
            'data-text-color': color,
            'style': `color: ${textColorValue(color)}`,
          }
        },
      },
    }
  },

  // ---------------------------------------------------------------------------
  // HTML (ProseMirror DOM) parsing & rendering
  // ------------------------------------------------------------------------
  parseHTML() {
    return [
      {
        tag: 'span[data-text-color]',
        getAttrs: (node: HTMLElement) => {
          const color = node.getAttribute('data-text-color')
          if (color !== null && color !== '' && isValidColorName(color))
            return { color }

          return false
        },
      },
      // Spans with only a CSS-variable inline style
      {
        tag: 'span',
        getAttrs: (node: HTMLElement) => {
          const raw = node.style.color
          if (!raw)
            return false

          const varMatch = CSS_VAR_COLOR_RE.exec(raw)
          const name = varMatch?.[1] ?? null
          if (name !== null && isValidColorName(name))
            return { color: name }

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
      setTextColor:
        (color: TextColorName) =>
          ({ commands }) => {
            if (!isValidColorName(color))
              return false

            return commands.setMark(this.name, { color })
          },

      unsetTextColor:
        () =>
          ({ commands }) =>
            commands.unsetMark(this.name),
    }
  },

  // ---------------------------------------------------------------------------
  // Markdown serialization  :::color[name]text:::
  // ------------------------------------------------------------------------
  renderMarkdown(node: JSONContent, h: MarkdownRendererHelpers, _ctx: RenderContext): string {
    // eslint-disable-next-line ts/no-unsafe-assignment
    const color = (node.attrs)?.color
    if (typeof color !== 'string' || !isValidColorName(color))
      return h.renderChildren(node)

    return `:::color[${color}]${h.renderChildren(node)}:::`
  },

  // ---------------------------------------------------------------------------
  // Markdown tokenizer for :::color[name]text:::
  // ------------------------------------------------------------------------
  markdownTokenizer: {
    name: 'textColor',
    level: 'inline',

    start(src: string): number {
      const idx = src.indexOf(':::color[')
      return idx === -1 ? -1 : idx
    },

    tokenize(src: string, _tokens: MarkdownToken[], lexer: MarkdownLexerConfiguration): MarkdownToken | undefined {
      const prefixMatch = PREFIX_COLOR_RE.exec(src)
      if (!prefixMatch)
        return undefined

      const color = prefixMatch[1]?.toLowerCase() ?? ''
      if (!isValidColorName(color))
        return undefined

      // A lazy regex stops at the first :::, which breaks stacked directives
      // like :::color[red]:::font[serif]text::::::. Track depth to find the outer close.
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
                type: 'textColor',
                raw,
                color,
                // Inline tokens keep nested marks like bold and mentions
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

  // Must match the tokenizer name so the framework wires up parseMarkdown.
  markdownTokenName: 'textColor',

  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers): MarkdownParseResult {
    const raw = token as unknown as Record<string, unknown>
    const rawColor = typeof raw.color === 'string' ? raw.color.toLowerCase() : ''
    const color: TextColorName | null = isValidColorName(rawColor) ? rawColor : null

    const innerTokens = (raw.tokens as MarkdownToken[] | undefined) ?? []
    const content = helpers.parseInline(innerTokens)

    if (color === null)
      return content

    return helpers.applyMark('textColor', content, { color })
  },
})
