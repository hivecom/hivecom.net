import type { SupabaseClient } from '@supabase/supabase-js'
import type { Editor as CoreEditor, JSONContent, MarkdownParseHelpers, MarkdownToken, MarkdownTokenizer } from '@tiptap/core'
import type { SuggestionOptions } from '@tiptap/suggestion'
import type { Component } from 'vue'
import type { Database } from '@/types/database.types'
import Mention from '@tiptap/extension-mention'
import { extractMentionIds } from '@/lib/markdown-processors'
import RichTextMentions from '../RichTextMentions.vue'
import { defineSuggestion } from './suggestion'

const mentionComponent: Component = RichTextMentions as Component

export const mentionSuggestionAllow: NonNullable<SuggestionOptions['allow']> = () => true

export function normalizeMentionQuery(query: string) {
  return query.startsWith('{') ? query.slice(1) : query
}

export function shouldFetchMentionQuery() {
  return true
}

export const MentionWithMarkdown = Mention.extend({
  markdownTokenName: 'mention',
  parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers) => {
    const rawId = (token.attributes as Record<string, unknown> | undefined)?.id
    const id = typeof rawId === 'string' ? rawId : null
    return helpers.createNode('mention', { id })
  },
  markdownTokenizer: {
    name: 'mention',
    level: 'inline',
    start(src: string) {
      const index = src.indexOf('@{')
      return index === -1 ? -1 : index
    },
    tokenize(src: string) {
      const match = /^@\{([0-9a-f-]{36})\}/i.exec(src)

      if (!match) {
        return undefined
      }

      return {
        type: 'mention',
        raw: match[0],
        attributes: {
          id: match[1],
        },
      }
    },
  } satisfies MarkdownTokenizer,
  renderMarkdown: (node: JSONContent) => {
    const rawId = (node.attrs as Record<string, unknown> | undefined)?.id
    const id = typeof rawId === 'string' ? rawId : ''

    if (id.trim() === '') {
      return ''
    }

    return `@{${id}}`
  },
})

export function createMentionExtension(
  supabase: SupabaseClient<Database>,
  options?: {
    allow?: SuggestionOptions['allow']
    allowEmptyQuery?: boolean
    shouldFetch?: (query: string) => boolean
    transformQuery?: (query: string) => string
  },
) {
  return MentionWithMarkdown.configure({
    suggestion: defineSuggestion(
      '@',
      mentionComponent,
      async (search_term) => {
        return supabase
          .rpc('search_profiles', { search_term })
          .select('username, id')
          .limit(32)
      },
      {
        allow: options?.allow ?? mentionSuggestionAllow,
        allowEmptyQuery: options?.allowEmptyQuery ?? true,
        shouldFetch: options?.shouldFetch ?? shouldFetchMentionQuery,
        transformQuery: options?.transformQuery ?? normalizeMentionQuery,
      },
    ),
    deleteTriggerWithBackspace: true,
    HTMLAttributes: {
      class: 'mention',
    },
    renderHTML(props) {
      return `@${props.node.attrs.label ?? props.node.attrs.id}`
    },
    renderText(props) {
      return `@{${props.node.attrs.id}}`
    },
  })
}

let mentionLookupRequestId = 0

export async function hydrateMentionLabels(
  editor: CoreEditor | null | undefined,
  supabase: SupabaseClient<Database>,
  markdown: string,
) {
  const currentEditor = editor
  if (!currentEditor) {
    return
  }

  const ids = extractMentionIds(markdown)
  if (ids.length === 0) {
    return
  }

  const requestId = ++mentionLookupRequestId
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', ids)

  if (requestId !== mentionLookupRequestId) {
    return
  }

  if (error !== null || data === null) {
    return
  }

  const lookup: Record<string, string> = Object.fromEntries(
    data
      .filter(profile => typeof profile.username === 'string' && profile.username.trim() !== '')
      .map(profile => [profile.id.toLowerCase(), profile.username]),
  )

  currentEditor.commands.command(({ tr, state }) => {
    let modified = false

    state.doc.descendants((node, pos) => {
      if (node.type.name !== 'mention') {
        return
      }

      const attrs = node.attrs as Record<string, unknown> | undefined
      const rawId = attrs?.id
      const id = typeof rawId === 'string' ? rawId.toLowerCase() : ''
      const username = lookup[id]
      const rawLabel = attrs?.label
      const existingLabel = typeof rawLabel === 'string' ? rawLabel : ''

      if (username === undefined || existingLabel === username) {
        return
      }

      tr.setNodeMarkup(pos, undefined, { ...node.attrs, label: username })
      modified = true
    })

    if (modified) {
      tr.setMeta('addToHistory', false)
      return true
    }

    return false
  })
}
