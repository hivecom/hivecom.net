import { createAtomBlockMarkdownSpec, mergeAttributes, Node } from '@tiptap/core'

// ---------------------------------------------------------------------------
// Audio node extension
//
// Block atom the markdown pre-processor renders as our AudioPlayer:
//   :::audio {src="https://..."} :::
// ------------------------------------------------------------------------
declare module '@tiptap/core' {

  // Module augmentation, typescript-eslint 8.69 reports it as unused

  interface Commands<ReturnType> {
    audio: {
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

  ...createAtomBlockMarkdownSpec({
    nodeName: 'audio',
    allowedAttributes: ['src'],
  }),
})
