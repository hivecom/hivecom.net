import type { Editor } from '@tiptap/vue-3'

export function handleFileUpload(editor: Editor, files: File[], pos?: number) {
  files.forEach((file) => {
    const fileReader = new FileReader()

    fileReader.readAsDataURL(file)
    fileReader.onload = () => {
      editor
        .chain()
        .insertContentAt(pos ?? editor.state.selection.anchor, {
          type: 'image',
          attrs: { src: fileReader.result },
        })
        .focus()
        .run()
    }

    // TODO: upload image to cdn
  })
}
