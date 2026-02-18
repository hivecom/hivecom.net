/* eslint-disable ts/no-unsafe-call */
/* eslint-disable ts/no-unsafe-member-access */
/* eslint-disable ts/no-floating-promises */

import type { FloatingElement, VirtualElement } from '@floating-ui/dom'
import type { Editor as CoreEditor } from '@tiptap/core'
import type { SuggestionKeyDownProps, SuggestionOptions, SuggestionProps } from '@tiptap/suggestion'
import type { Component } from 'vue'
import { computePosition, flip, shift } from '@floating-ui/dom'
import { posToDOMRect, VueRenderer } from '@tiptap/vue-3'

async function updatePosition(editor: CoreEditor, element: HTMLElement) {
  const virtualElement: VirtualElement = {
    getBoundingClientRect: () => posToDOMRect(editor.view, editor.state.selection.from, editor.state.selection.to),
  }

  const result = await computePosition(virtualElement, element, {
    placement: 'bottom-start',
    strategy: 'absolute',
    middleware: [shift(), flip()],
  })

  element.style.width = `208px`
  element.style.position = result.strategy
  element.style.top = `${result.y}px`
  element.style.left = `${result.x}px`
}

interface MentionOptions<T = unknown> { name: string, data: T }

export function createSuggestionPlugin(char: string, options: MentionOptions[], model: Component) {
  const supabase = useSupabaseClient()

  const plugin = {
    char,
    items: async ({ query }: { query: string }) => {
      if (!query)
        return []

      const result = await supabase
        .rpc('search_profiles', { search_term: query })
        .select('username, id')
        .limit(32)

      if (result.error)
        return []

      return result.data as Array<{ username: string, id: string }>
    },
    render: () => {
      let component: VueRenderer

      return {
        onStart: (props: SuggestionProps) => {
          component = new VueRenderer(model, {
            props,
            editor: props.editor,
          })

          if (!props.clientRect || !component?.element) {
            return
          }

          const el = component.element as HTMLElement
          el.style.position = 'absolute'
          document.body.appendChild(el)
          updatePosition(props.editor, el)
        },
        onUpdate: (props: SuggestionProps) => {
          component?.updateProps(props)

          if (!props.clientRect || !component?.element) {
            return
          }

          updatePosition(props.editor, component.element as unknown as FloatingElement)
        },
        onKeyDown(props: SuggestionKeyDownProps) {
          if (props.event.key === 'Escape') {
            component?.destroy()
            return true
          }

          component?.ref?.onKeyDown?.(props)
          return false
        },
        onExit() {
          component.element?.remove()
          component?.destroy()
        },
      }
    },
  } satisfies Omit<SuggestionOptions, 'editor'>

  return plugin
}
