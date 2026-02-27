/* eslint-disable ts/no-unsafe-call */
/* eslint-disable ts/no-unsafe-member-access */
/* eslint-disable ts/no-floating-promises */

import type { FloatingElement, VirtualElement } from '@floating-ui/dom'
import type { PostgrestResponse } from '@supabase/supabase-js'
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

// NOTE: This is typed a bit weirdly because supabase and postgres typing
// systems are complicated af. It gets the job done.

export function defineSuggestion(
  char: string,
  model: Component,
  query: (search_term: string) => Promise<unknown>,
  options?: {
    allow?: SuggestionOptions['allow']
    transformQuery?: (query: string) => string
    allowEmptyQuery?: boolean
    shouldFetchRaw?: (query: string) => boolean
    shouldFetch?: (query: string) => boolean
  },
) {
  const plugin = {
    char,
    allow: options?.allow,
    items: async (props) => {
      const rawQuery = props.query ?? ''
      const searchTerm = options?.transformQuery ? options.transformQuery(rawQuery) : rawQuery

      if (!searchTerm.trim() && !options?.allowEmptyQuery)
        return []

      if (options?.shouldFetchRaw && !options.shouldFetchRaw(rawQuery))
        return []

      if (options?.shouldFetch && !options.shouldFetch(searchTerm))
        return []

      const result = await query(searchTerm) as PostgrestResponse<unknown>

      if (result.error)
        return []

      return result.data
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
            props.event.preventDefault()
            props.event.stopPropagation()
            component?.destroy()
            return true
          }

          const handled = Boolean(component?.ref?.onKeyDown?.(props))

          if (handled === true) {
            props.event.preventDefault()
            props.event.stopPropagation()
            return true
          }

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
