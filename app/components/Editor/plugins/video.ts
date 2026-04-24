import { createAtomBlockMarkdownSpec, mergeAttributes, Node } from '@tiptap/core'

// ---------------------------------------------------------------------------
// Video node extension
//
// Stores uploaded/linked videos as a block-level atom node in Tiptap.
// Serializes to the :::video directive syntax so the markdown pre-processor
// can convert it to a <video> HTML element before rendering.
//
// Directive format (mirrors the YouTube extension pattern):
//   :::video {src="https://..." width="640" height="360"} :::
// ---------------------------------------------------------------------------

declare module '@tiptap/core' {
  // eslint-disable-next-line unused-imports/no-unused-vars
  interface Commands<ReturnType> {
    video: {
      /** Insert a video node at the current selection. */
      insertVideo: (attrs: { src: string, width?: number, height?: number }) => ReturnType
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
      width: {
        default: 640,
      },
      height: {
        default: 360,
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

  // Markdown serialization: :::video {src="..." width="640" height="360"} :::
  ...createAtomBlockMarkdownSpec({
    nodeName: 'video',
    allowedAttributes: ['src', 'width', 'height'],
  }),
})
