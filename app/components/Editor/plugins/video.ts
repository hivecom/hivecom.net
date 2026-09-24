import { createAtomBlockMarkdownSpec, mergeAttributes, Node } from '@tiptap/core'

// ---------------------------------------------------------------------------
// Video node extension
//
// Block atom the markdown pre-processor renders as a <video> element:
//   :::video {src="https://..."} :::
// ------------------------------------------------------------------------
declare module '@tiptap/core' {

  // Module augmentation, typescript-eslint 8.69 reports it as unused

  interface Commands<ReturnType> {
    video: {
      insertVideo: (attrs: { src: string }) => ReturnType
    }
  }
}

export const Video = Node.create({
  name: 'video',

  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      // Client-only id that tracks a placeholder through upload, since `src`
      // changes. Never serialized: rendered is false and the markdown spec only allows `src`.
      uploadId: {
        default: null,
        rendered: false,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-video-embed] video',
      },
      {
        tag: 'video[src]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      { 'data-video-embed': '' },
      ['video', mergeAttributes(HTMLAttributes, { controls: '' })],
    ]
  },

  addCommands() {
    return {
      insertVideo:
        attrs =>
          ({ commands }) =>
            commands.insertContent({
              type: this.name,
              attrs,
            }),
    }
  },

  ...createAtomBlockMarkdownSpec({
    nodeName: 'video',
    allowedAttributes: ['src'],
  }),
})
