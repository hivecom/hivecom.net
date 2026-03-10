import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'

// This file is loaded as a real ES module by @nuxtjs/mdc (not JSON-serialised),
// so RegExp values in the rehype-sanitize schema survive intact.
//
// The rehype-sanitize options in nuxt.config.ts are passed through
// JSON.stringify when generating .nuxt/mdc-imports.mjs, which silently
// converts every RegExp to {} — causing the iframe src allow-list to
// accept nothing and stripping all YouTube embeds.  Defining the plugin
// here bypasses that serialisation step entirely.

export default {
  rehype: {
    plugins: {
      'rehype-sanitize': {
        instance: rehypeSanitize,
        options: {
          ...defaultSchema,
          tagNames: [
            ...(defaultSchema.tagNames ?? []),
            'iframe',
            // KaTeX emits <svg>, <path>, <line>, <use> for some output modes
            'svg',
            'path',
            'line',
            'use',
          ],
          attributes: {
            ...defaultSchema.attributes,
            // span: allow class (KaTeX uses many class names) and style
            // restricted to color only (processColorTags emits inline color).
            'span': [
              ...(defaultSchema.attributes?.span ?? []),
              'className',
              'style',
              'ariaHidden',
            ],
            // div: allow class and style for KaTeX block wrappers
            'div': [
              ...(defaultSchema.attributes?.div ?? []),
              'className',
              'style',
            ],
            // iframe: locked to YouTube nocookie embeds only.
            // The RegExp here is the reason this config must live in
            // mdc.config.ts rather than nuxt.config.ts — JSON.stringify
            // turns RegExp into {} which makes every src value fail the check.
            'iframe': [
              ['src', /^https:\/\/www\.youtube-nocookie\.com\/embed\//],
              'width',
              'height',
              'frameborder',
              'allow',
              'allowfullscreen',
              'className',
            ],
            // SVG elements for KaTeX
            'svg': ['xmlns', 'width', 'height', 'viewBox', 'className', 'style', 'ariaHidden', 'focusable'],
            'path': ['d', 'stroke', 'strokeWidth', 'fill', 'className'],
            'line': ['x1', 'y1', 'x2', 'y2', 'stroke', 'strokeWidth', 'className'],
            'use': [['href', /^#/], ['xlinkHref', /^#/], 'className'],
            // Allow class on any element for KaTeX and highlight.js
            '*': ['className'],
          },
        },
      },
    },
  },
}
