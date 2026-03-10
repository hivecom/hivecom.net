import type { JSONContent, MarkdownLexerConfiguration, MarkdownParseHelpers, MarkdownParseResult, MarkdownRendererHelpers, MarkdownToken, MarkdownTokenizer, RenderContext } from '@tiptap/core'
import { Mark, mergeAttributes } from '@tiptap/core'

const CSS_VAR_COLOR_RE = /var\(--text-color-([a-z-]+)\)/
const PREFIX_COLOR_RE = /^:::color\[([a-z-]+)\]/i
const OPENING_DIRECTIVE_RE = /^[a-z]+\[/i
const CLOSING_DIRECTIVE_RE = /^[a-z[]/i

// ---------------------------------------------------------------------------
// Named color palette
// ---------------------------------------------------------------------------

// The canonical set of allowed color names. Each name maps to a CSS custom
// property defined in app/assets/index.scss so that the actual hue adapts
// automatically to the active theme (light / dark / future themes).
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

/** Returns the CSS custom property name for a palette color, e.g. "red" → "--text-color-red". */
export function textColorVar(name: TextColorName): string {
  return `--text-color-${name}`
}

/** Returns the CSS value string for a palette color, e.g. "red" → "var(--text-color-red)". */
export function textColorValue(name: TextColorName): string {
  return `var(${textColorVar(name)})`
}

function isValidColorName(value: string): value is TextColorName {
  return (TEXT_COLOR_NAMES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// TipTap Mark extension
// ---------------------------------------------------------------------------

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textColor: {
      /** Apply a named palette color to the selected text, e.g. "red". */
      setTextColor: (color: TextColorName) => ReturnType
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
          // Support both the data attribute (written by renderHTML) and a
          // legacy inline style for graceful degradation.
          const fromAttr = element.getAttribute('data-text-color')
          if (fromAttr !== null && fromAttr !== '' && isValidColorName(fromAttr))
            return fromAttr

          // Fallback: try to recover a name from a CSS-variable inline style.
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
  // ---------------------------------------------------------------------------

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
      // Graceful fallback for legacy spans that carry a CSS-variable inline style.
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
  // ---------------------------------------------------------------------------

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
  // Markdown serialization
  // Serializes to :::color[name]text::: — triple-colon inline directive
  // syntax, consistent with other custom directives in the markdown dialect.
  // ---------------------------------------------------------------------------

  renderMarkdown(node: JSONContent, h: MarkdownRendererHelpers, _ctx: RenderContext): string {
    const color = (node.attrs as Record<string, unknown> | undefined)?.color
    if (typeof color !== 'string' || !isValidColorName(color))
      return h.renderChildren(node)

    return `:::color[${color}]${h.renderChildren(node)}:::`
  },

  // ---------------------------------------------------------------------------
  // Markdown tokenizer — teaches marked.js to recognise :::color[name]text:::
  // ---------------------------------------------------------------------------

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

      // Find the closing ::: that matches this opening, accounting for nesting.
      // A plain lazy regex ([\s\S]*?) stops at the first ::: it encounters, which
      // is wrong when directives are stacked (e.g. :::color[red]:::font[serif]text::::::).
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
          // Closing ::: — anything NOT followed by a letter or '[' counts,
          // including being followed by another ':' (which is the next closing :::).
          if (!CLOSING_DIRECTIVE_RE.test(after)) {
            depth--
            if (depth === 0) {
              const rawInner = src.slice(contentStart, i)
              const raw = src.slice(0, i + 3)
              return {
                type: 'textColor',
                raw,
                color,
                // Tokenize inner content as inline tokens so nested marks
                // (bold, italic, mentions, etc.) are preserved.
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

  // Must match the tokenizer name so the framework wires up parseMarkdown.
  markdownTokenName: 'textColor',

  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers): MarkdownParseResult {
    const raw = token as unknown as Record<string, unknown>
    const rawColor = typeof raw.color === 'string' ? raw.color.toLowerCase() : ''
    const color: TextColorName | null = isValidColorName(rawColor) ? rawColor : null

    const innerTokens = (raw.tokens as MarkdownToken[] | undefined) ?? []
    const content = helpers.parseInline(innerTokens)

    // Fall back to plain inline content if the color name is invalid.
    if (color === null)
      return content

    return helpers.applyMark('textColor', content, { color })
  },
})
