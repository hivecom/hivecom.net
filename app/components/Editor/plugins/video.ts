import { createAtomBlockMarkdownSpec, mergeAttributes, Node } from '@tiptap/core'

// ---------------------------------------------------------------------------
// Video node extension
//
// Stores uploaded/linked videos as a block-level atom node in Tiptap.
// Serializes to the :::video directive syntax so the markdown pre-processor
// can convert it to a <video> HTML element before rendering.
//
// Directive format (mirrors the YouTube extension pattern):
//   :::video {src="https://..."} :::
// ------------------------------------------------------------------------
declare module '@tiptap/core' {

  interface Commands<ReturnType> {
    video: {
      /** Insert a video node at the current selection. */
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
      // Transient client-only id used to track a placeholder through async
      // upload without relying on the mutable `src`. rendered: false keeps it
      // out of the serialized HTML, and the atom-block markdown spec below only
      // allows `src`, so it never leaks into stored markdown either.
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

  // Markdown serialization: :::video {src="..."} :::
  ...createAtomBlockMarkdownSpec({
    nodeName: 'video',
    allowedAttributes: ['src'],
  }),
})
