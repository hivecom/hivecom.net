import { createAtomBlockMarkdownSpec, mergeAttributes, Node } from '@tiptap/core'

// ---------------------------------------------------------------------------
// Audio node extension
//
// Stores uploaded/linked audio as a block-level atom node in Tiptap.
// Serializes to the :::audio directive syntax so the markdown pre-processor
// can convert it to an <audio> element (rendered as our AudioPlayer) before
// display.
//
// Directive format (mirrors the video extension pattern):
//   :::audio {src="https://..."} :::
// ------------------------------------------------------------------------
declare module '@tiptap/core' {

  interface Commands<ReturnType> {
    audio: {
      /** Insert an audio node at the current selection. */
      insertAudio: (attrs: { src: string }) => ReturnType
    }
  }
}

export const Audio = Node.create({
  name: 'audio',

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
        tag: 'div[data-audio-embed] audio',
      },
      {
        tag: 'audio[src]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      { 'data-audio-embed': '' },
      ['audio', mergeAttributes(HTMLAttributes, { controls: '' })],
    ]
  },

  addCommands() {
    return {
      insertAudio:
        attrs =>
          ({ commands }) =>
            commands.insertContent({
              type: this.name,
              attrs,
            }),
    }
  },

  // Markdown serialization: :::audio {src="..."} :::
  ...createAtomBlockMarkdownSpec({
    nodeName: 'audio',
    allowedAttributes: ['src'],
  }),
})
