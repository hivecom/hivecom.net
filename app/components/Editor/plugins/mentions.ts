import type { SupabaseClient } from '@supabase/supabase-js'
import type { Editor as CoreEditor, JSONContent, MarkdownParseHelpers, MarkdownToken, MarkdownTokenizer } from '@tiptap/core'
import type { Node as PmNode, ResolvedPos } from '@tiptap/pm/model'
import type { SuggestionOptions } from '@tiptap/suggestion'
import type { Component } from 'vue'
import type { Database } from '@/types/database.types'
import Mention from '@tiptap/extension-mention'
import { extractMentionIds, isValidMentionUsername } from '@/lib/markdown-processors'
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
    const rawId = (node.attrs as Record<string, unknown> | undefined)?.id
    const id = typeof rawId === 'string' ? rawId : ''

    if (id.trim() === '') {
      return ''
    }

    return `@{${id}}`
  },

  /**
   * Override the built-in Backspace / Delete shortcuts so that mention nodes
   * inside list items are deleted in a single step rather than going through
   * ProseMirror's two-step "select atom → delete selection" dance, which
   * allows the list keymap to intercept the second keypress and create a new
   * list item instead of deleting the mention.
   *
   * Outside of list items the parent extension's original behaviour is
   * preserved via `this.parent?.()`.
   */
  addKeyboardShortcuts() {
    const parentShortcuts = this.parent?.() ?? {}

    return {
      ...parentShortcuts,

      Backspace: ({ editor }) => {
        const { state, view } = editor
        const { selection } = state
        const { $from, empty } = selection

        // NodeSelection on a mention inside a list → delete it directly
        if (!empty) {
          const ns = selection as { node?: PmNode }
          if (ns.node?.type.name === 'mention' && isInsideListItem($from)) {
            view.dispatch(state.tr.deleteSelection())
            return true
          }
          // Non-mention selection – fall through to parent
          return parentShortcuts.Backspace?.({ editor }) ?? false
        }

        // Collapsed cursor immediately after a mention inside a list
        const nodeBefore = $from.nodeBefore
        if (nodeBefore?.type.name === 'mention' && isInsideListItem($from)) {
          view.dispatch(state.tr.delete($from.pos - nodeBefore.nodeSize, $from.pos))
          return true
        }

        // Cursor is after trailing whitespace that was inserted right after a mention
        // (the suggestion command always appends a space). Delete both the whitespace
        // and the mention in one step so the list structure is never touched.
        if (
          isInsideListItem($from)
          && nodeBefore?.isText
          && nodeBefore.text?.trim() === ''
        ) {
          // Walk back past the whitespace to find an adjacent mention
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

        // Cursor is at offset 0 of a list item paragraph and the first child is a
        // mention – delete it instead of letting joinBackward fire (which would
        // restructure the list rather than removing the mention).
        if ($from.parentOffset === 0 && isInsideListItem($from)) {
          const firstChild = $from.parent.firstChild
          if (firstChild?.type.name === 'mention') {
            view.dispatch(state.tr.delete($from.pos, $from.pos + firstChild.nodeSize))
            return true
          }
        }

        // All other cases – delegate to the parent Mention handler
        return parentShortcuts.Backspace?.({ editor }) ?? false
      },

      Delete: ({ editor }) => {
        const { state, view } = editor
        const { selection } = state
        const { $from, empty } = selection

        // NodeSelection on a mention inside a list → delete it directly
        if (!empty) {
          const ns = selection as { node?: PmNode }
          if (ns.node?.type.name === 'mention' && isInsideListItem($from)) {
            view.dispatch(state.tr.deleteSelection())
            return true
          }
          return parentShortcuts.Delete?.({ editor }) ?? false
        }

        // Collapsed cursor immediately before a mention inside a list
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
      return `@${props.node.attrs.label ?? props.node.attrs.id}`
    },
    renderText(props) {
      return `@{${props.node.attrs.id}}`
    },
  })
}

/**
 * Resolves plain-text @username mentions in a markdown string to their
 * canonical @{uuid} form by looking up matching profiles in Supabase.
 *
 * This is intended for content written in plain-text mode where the Tiptap
 * suggestion flow never ran, so mentions are stored as bare @username tokens
 * rather than the structured @{uuid} format.
 *
 * Already-resolved @{uuid} patterns are left untouched because `{` is not a
 * word character and therefore won't be captured by the @\w+ pattern.
 */
export async function resolvePlainTextMentions(
  content: string,
  supabase: SupabaseClient<Database>,
): Promise<string> {
  if (!content)
    return content

  // Matches @username - @{uuid} is NOT matched because { is not a \w char.
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

  // Use ilike per username so the lookup is case-insensitive.
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .or(usernameList.map(u => `username.ilike.${u}`).join(','))

  if (error !== null || data.length === 0)
    return content

  // Build a lowercase username → id lookup.
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
