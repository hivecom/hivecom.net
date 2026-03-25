import { createAtomBlockMarkdownSpec, mergeAttributes, Node } from '@tiptap/core'

// ---------------------------------------------------------------------------
// DataFile node extension
//
// Stores uploaded CSV/JSON files as a block-level atom node in Tiptap.
// Serializes to the :::datafile directive syntax so the markdown pre-processor
// can convert it to a styled attachment card before rendering.
//
// Directive format:
//   :::datafile {src="https://..." name="data.csv" type="csv"} :::
// ---------------------------------------------------------------------------

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    dataFile: {
      /** Insert a data file node at the current selection. */
      insertDataFile: (attrs: { src: string, name: string, type: 'csv' | 'json' }) => ReturnType
    }
  }
}

export const DataFile = Node.create({
  name: 'dataFile',

  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      name: {
        default: '',
      },
      type: {
        default: 'csv',
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-datafile]',
        getAttrs(node) {
          return {
            src: (node).dataset.src ?? null,
            name: (node).dataset.name ?? '',
            type: (node).dataset.type ?? 'csv',
          }
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const src = HTMLAttributes.src as string | null
    const name = HTMLAttributes.name as string
    const type = HTMLAttributes.type as string
    const icon = type === 'json' ? '{ }' : '⊞'
    const label = name || (type === 'json' ? 'data.json' : 'data.csv')

    return [
      'div',
      mergeAttributes(
        { 'data-datafile': '', 'data-src': src ?? '', 'data-name': label, 'data-type': type },
        { class: 'datafile-node' },
      ),
      [
        'div',
        { class: 'datafile-node__inner' },
        ['span', { class: 'datafile-node__icon' }, icon],
        ['span', { class: 'datafile-node__name' }, label],
        [
          'a',
          { class: 'datafile-node__link', href: src ?? '#', target: '_blank', rel: 'noopener noreferrer' },
          'Download',
        ],
      ],
    ]
  },

  addCommands() {
    return {
      insertDataFile:
        attrs =>
          ({ commands }) =>
            commands.insertContent({
              type: this.name,
              attrs,
            }),
    }
  },

  // Markdown serialization: :::datafile {src="..." name="..." type="csv"} :::
  ...createAtomBlockMarkdownSpec({
    nodeName: 'dataFile',
    allowedAttributes: ['src', 'name', 'type'],
  }),
})
