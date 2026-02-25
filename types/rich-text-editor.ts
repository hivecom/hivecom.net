import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

export interface ShouldShowMenuProps {
  editor: unknown
  element: HTMLElement
  view: EditorView
  state: EditorState
  oldState?: EditorState
  from: number
  to: number
}
