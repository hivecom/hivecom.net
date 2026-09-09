import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import CssWorker from 'monaco-editor/language/css/css.worker?worker'

export default defineNuxtPlugin(() => {
  globalThis.MonacoEnvironment = {
    getWorker(_: unknown, label: string) {
      if (label === 'css' || label === 'less' || label === 'scss') {
        return new CssWorker()
      }
      return new EditorWorker()
    },
  }
})
