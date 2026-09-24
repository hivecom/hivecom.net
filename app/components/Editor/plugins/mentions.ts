import type { SupabaseClient } from '@supabase/supabase-js'
import type { Editor as CoreEditor, JSONContent, MarkdownParseHelpers, MarkdownToken, MarkdownTokenizer } from '@tiptap/core'
import type { Node as PmNode, ResolvedPos } from '@tiptap/pm/model'
import type { SuggestionOptions } from '@tiptap/suggestion'
import type { Component } from 'vue'
import type { Database } from '@/types/database.types'
import Mention from '@tiptap/extension-mention'
import { extractMentionIds, isValidMentionUsername } from '@/lib/markdownProcessors'
import RichTextMentions from '../RichTextMentions.vue'
import { defineSuggestion } from './suggestion'

const MENTION_BRACED_TOKEN_RE = /^@\{([0-9a-f-]{36})\}/i
const PLAIN_MENTION_RE = /@(\w{1,32})/g

const mentionComponent: Component = RichTextMentions as Component

export const mentionSuggestionAllow: NonNullable<SuggestionOptions['allow']> = () => true

export function normalizeMentionQuery(query: string) {
  return query.startsWith('{') ? query.slice(1) : query
}

export function shouldFetchMentionQuery() {
  return true
}

const LIST_ITEM_TYPES = new Set(['listItem', 'taskItem'])

function isInsideListItem($pos: ResolvedPos): boolean {
  for (let depth = $pos.depth; depth > 0; depth--) {
    if (LIST_ITEM_TYPES.has($pos.node(depth).type.name))
      return true
  }
  return false
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
      const match = MENTION_BRACED_TOKEN_RE.exec(src)

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
    // eslint-disable-next-line ts/no-unsafe-assignment
    const rawId = (node.attrs)?.id
    const id = typeof rawId === 'string' ? rawId : ''

    if (id.trim() === '') {
      return ''
    }

    return `@{${id}}`
  },

  // Mentions inside list items delete in one step. ProseMirror's two-step
  // select-then-delete lets the list keymap turn the second press into a new list item.
  addKeyboardShortcuts() {
    const parentShortcuts = this.parent?.() ?? {}

    return {
      ...parentShortcuts,

      Backspace: ({ editor }) => {
        const { state, view } = editor
        const { selection } = state
        const { $from, empty } = selection

        if (!empty) {
          const ns = selection as { node?: PmNode }
          if (ns.node?.type.name === 'mention' && isInsideListItem($from)) {
            view.dispatch(state.tr.deleteSelection())
            return true
          }

          return parentShortcuts.Backspace?.({ editor }) ?? false
        }

        const nodeBefore = $from.nodeBefore
        if (nodeBefore?.type.name === 'mention' && isInsideListItem($from)) {
          view.dispatch(state.tr.delete($from.pos - nodeBefore.nodeSize, $from.pos))
          return true
        }

        // The suggestion command always appends a space after a mention, so
        // delete the whitespace and the mention together.
        if (
          isInsideListItem($from)
          && nodeBefore?.isText
          && nodeBefore.text?.trim() === ''
        ) {
          const wsSize = nodeBefore.nodeSize
          const posBeforeWs = $from.pos - wsSize
          const $beforeWs = state.doc.resolve(posBeforeWs)
          const mentionBefore = $beforeWs.nodeBefore
          if (mentionBefore?.type.name === 'mention') {
            view.dispatch(
              state.tr.delete($from.pos - wsSize - mentionBefore.nodeSize, $from.pos),
            )
            return true
          }
        }

        // At the start of a list item, joinBackward would restructure the list
        // instead of removing a leading mention.
        if ($from.parentOffset === 0 && isInsideListItem($from)) {
          const firstChild = $from.parent.firstChild
          if (firstChild?.type.name === 'mention') {
            view.dispatch(state.tr.delete($from.pos, $from.pos + firstChild.nodeSize))
            return true
          }
        }

        return parentShortcuts.Backspace?.({ editor }) ?? false
      },

      Delete: ({ editor }) => {
        const { state, view } = editor
        const { selection } = state
        const { $from, empty } = selection

        if (!empty) {
          const ns = selection as { node?: PmNode }
          if (ns.node?.type.name === 'mention' && isInsideListItem($from)) {
            view.dispatch(state.tr.deleteSelection())
            return true
          }
          return parentShortcuts.Delete?.({ editor }) ?? false
        }

        const nodeAfter = $from.nodeAfter
        if (nodeAfter?.type.name === 'mention' && isInsideListItem($from)) {
          view.dispatch(state.tr.delete($from.pos, $from.pos + nodeAfter.nodeSize))
          return true
        }

        return parentShortcuts.Delete?.({ editor }) ?? false
      },
    }
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
      return ['span', {}, `@${props.node.attrs.label ?? props.node.attrs.id}`]
    },
    renderText(props) {
      return `@{${props.node.attrs.id}}`
    },
  })
}

// Resolves @username to @{uuid} for plain-text mode, where the Tiptap
// suggestion flow never ran
export async function resolvePlainTextMentions(
  content: string,
  supabase: SupabaseClient<Database>,
): Promise<string> {
  if (!content)
    return content

  // Skips @{uuid}, since { isn't a \w char
  const plainMentionPattern = PLAIN_MENTION_RE

  const usernames = new Set<string>()
  for (const match of content.matchAll(plainMentionPattern)) {
    const username = match[1]
    if (typeof username === 'string' && isValidMentionUsername(username))
      usernames.add(username)
  }

  if (usernames.size === 0)
    return content

  const usernameList = [...usernames]

  // ilike per username for a case-insensitive lookup
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .or(usernameList.map(u => `username.ilike.${u}`).join(','))

  if (error !== null || data.length === 0)
    return content

  const lookup: Record<string, string> = {}
  for (const p of data) {
    if (typeof p.username === 'string' && p.username.trim() !== '') {
      lookup[p.username.toLowerCase()] = p.id
    }
  }

  return content.replace(plainMentionPattern, (match, username: string) => {
    const id = lookup[username.toLowerCase()]
    return id !== undefined ? `@{${id}}` : match
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

  // The editor can be torn down mid-fetch. Dispatching on it walks a detached
  // DOM and throws "can't access property nextSibling, e is null".
  if (currentEditor.isDestroyed) {
    return
  }

  currentEditor.commands.command(({ tr }) => {
    let modified = false

    tr.doc.descendants((node, pos) => {
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
