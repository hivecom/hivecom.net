import type { Options as SanitizeSchema } from 'rehype-sanitize'
import { defineConfig } from '@nuxtjs/mdc/config'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'

// MDC only picks this file up from srcDir (app/), and only reads the `unified`
// hooks. A RegExp in the allow-list also can't go through nuxt.config.ts, whose
// options are JSON.stringified.
//
// The rehype hook runs before MDC's own rehype plugins, so raw HTML has to be
// parsed here first or the sanitizer drops it wholesale. KaTeX runs after this
// and its output is trusted, so none of it needs allowing here.

// The only inline styles markdownProcessors emits, one per text mark.
const TEXT_MARK_STYLE_RE = /^(?:color: var\(--text-color-[\w-]+\)|font-family: var\(--text-font-[\w-]+\)|font-size: var\(--text-size-[\w-]+\))$/

// Our own embed and attachment markup. Anything else would let a post borrow app
// classes and restyle the page around it.
const MD_CLASS_RE = /^md-[\w-]+$/

const schema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'iframe',
    'video',
    'audio',
    'shared-user-mention',
    'shared-channel-mention',
  ],
  attributes: {
    ...defaultSchema.attributes,
    // Same className entry as the default plus ours, since only one per key counts.
    'a': [
      ...(defaultSchema.attributes?.a ?? []).filter(def => !(Array.isArray(def) && def[0] === 'className')),
      ['className', 'data-footnote-backref', MD_CLASS_RE],
      ['target', '_blank'],
      'rel',
    ],
    // MDC's code handler keeps the source and language on <pre> for rendering.
    'pre': [['className', /^language-./], 'language', 'filename', 'highlights', 'meta', 'code'],
    'code': [['className', /^language-./, 'math-inline', 'math-display'], 'language', '__ignoreMap'],
    'span': [
      ...(defaultSchema.attributes?.span ?? []),
      ['className', MD_CLASS_RE],
      ['style', TEXT_MARK_STYLE_RE],
      'dataTextColor',
      'dataTextFont',
      'dataTextSize',
    ],
    'div': [
      ...(defaultSchema.attributes?.div ?? []),
      ['className', MD_CLASS_RE],
      'dataType',
    ],
    // Locked to YouTube nocookie embeds. Raw HTML arrives with hast property
    // names, MDC component syntax with the attribute names as written.
    'iframe': [
      ['src', /^https:\/\/www\.youtube-nocookie\.com\/embed\//],
      'width',
      'height',
      'frameBorder',
      'frameborder',
      'allow',
      'allowFullScreen',
      'allowfullscreen',
    ],
    'video': ['src', 'controls'],
    'audio': ['src', 'controls'],
    'shared-user-mention': ['user-id', 'userId'],
    'shared-channel-mention': ['channel'],
  },
}

export default defineConfig({
  unified: {
    // .use() mutates the processor, so it's returned as is to keep MDC's type.
    rehype(processor) {
      processor
        .use(rehypeRaw, { passThrough: ['element'] })
        .use(rehypeSanitize, schema)

      return processor
    },
  },
})
