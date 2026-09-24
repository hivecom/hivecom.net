import type { SupabaseClient } from '@supabase/supabase-js'
import type { JSONContent } from '@tiptap/core'
import type { EditorView } from '@tiptap/pm/view'
import { Node } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { parseInternalUrl } from '@/composables/useDataLinkPreview'

// ---------------------------------------------------------------------------
// LinkEmbed node extension
//
// A standalone internal hivecom link shown as an embed card. It serializes to
// a bare URL on its own line, which transformLinkEmbeds() in linkEmbedAST.ts
// renders as <SharedLinkEmbed>. A paragraph holding only an internal
// self-link gets converted into this node automatically.
// ------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------
// The href when `node` is a paragraph holding only an internal self-link
function getStandaloneLinkHref(node: import('@tiptap/pm/model').Node): string | null {
  if (node.type.name !== 'paragraph')
    return null

  if (node.childCount !== 1)
    return null

  const child = node.firstChild
  if (!child || child.type.name !== 'text')
    return null

  if (child.marks.length !== 1)
    return null

  const mark = child.marks[0]!
  if (mark.type.name !== 'link')
    return null

  const href = mark.attrs.href as string | null | undefined
  if (href == null || href === '')
    return null

  if (child.text !== href)
    return null

  if (!parseInternalUrl(href))
    return null

  return href
}

// ---------------------------------------------------------------------------
// Node definition
// ------------------------------------------------------------------------
export const LinkEmbed = Node.create({
  name: 'linkEmbed',

  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      href: {
        default: null,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-link-embed]',
        getAttrs(node) {
          return {
            href: (node).dataset.href ?? null,
          }
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const href = HTMLAttributes.href as string | null
    const parsed = href != null && href !== '' ? parseInternalUrl(href) : null

    const isLinkedReply = parsed?.type === 'forum-discussion' && parsed.commentId !== null
    const eyebrow = parsed?.type === 'forum-discussion'
      ? isLinkedReply ? 'Forum discussion - Linked reply' : 'Forum discussion'
      : parsed?.type === 'profile'
        ? 'Profile'
        : parsed?.type === 'gameserver'
          ? 'Game server'
          : parsed?.type === 'event'
            ? 'Event'
            : parsed?.type === 'vote'
              ? 'Vote'
              : 'Internal link'

    const displayUrl = parsed
      ? (parsed.type === 'forum-discussion'
          ? `/forum/${parsed.slug}`
          : parsed.type === 'profile'
            ? `/profile/${parsed.userId ?? parsed.username}`
            : parsed.type === 'gameserver'
              ? `/servers/gameservers/${parsed.id}`
              : parsed.type === 'event'
                ? `/events/${parsed.id}`
                : parsed.type === 'vote'
                  ? `/votes/${parsed.id}`
                  : (href ?? ''))
      : (href ?? '')

    return [
      'div',
      {
        'data-link-embed': '',
        'data-href': href ?? '',
        'class': 'link-embed-node',
        'contenteditable': 'false',
      },
      ['div', { class: 'link-embed-node__eyebrow' }, eyebrow],
      ['div', { class: 'link-embed-node__url' }, displayUrl],
    ]
  },

  // A bare URL skips getEditorMarkdown()'s SELF_LINK_RE and feeds the AST transform directly
  renderMarkdown(node: JSONContent): string {
    return (node.attrs?.href as string | null | undefined) ?? ''
  },

  addProseMirrorPlugins() {
    const nodeType = this.type

    let supabase: SupabaseClient | null = null
    try {
      supabase = useSupabaseClient()
    }
    catch {
      // Outside a Nuxt context (SSR, tests), so no UUID resolution
    }

    // Lets the async UUID lookups dispatch into the live view
    const resolveViewRef: { view: EditorView | null } = { view: null }

    return [
      new Plugin({
        key: new PluginKey('linkEmbedAutoConvert'),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some(tr => tr.docChanged))
            return null

          const tr = newState.tr
          let changed = false

          const toResolve: Array<{ username: string, originalHref: string }> = []

          // Collect first. Replacing during the walk leaves stale positions and
          // throws "RangeError: Position X out of range".
          const replacements: Array<{ pos: number, nodeSize: number, href: string }> = []

          newState.doc.descendants((node, pos) => {
            const href = getStandaloneLinkHref(node)
            if (href == null || href === '')
              return

            replacements.push({ pos, nodeSize: node.nodeSize, href })
          })

          // Reverse order so earlier replacements don't shift later positions
          for (let i = replacements.length - 1; i >= 0; i--) {
            const { pos, nodeSize, href } = replacements[i]!
            tr.replaceWith(pos, pos + nodeSize, nodeType.create({ href }))
            changed = true

            if (supabase != null) {
              const parsed = parseInternalUrl(href)
              if (parsed?.type === 'profile' && parsed.username != null)
                toResolve.push({ username: parsed.username, originalHref: href })
            }
          }

          // setTimeout so the view has applied this transaction before we dispatch
          if (supabase != null && toResolve.length > 0) {
            const client = supabase
            setTimeout(() => {
              for (const { username, originalHref } of toResolve) {
                client
                  .from('profiles')
                  .select('id')
                  .eq('username', username)
                  .maybeSingle()
                  .then(({ data }: { data: { id: string } | null }) => {
                    if (data?.id == null)
                      return

                    const uuid = data.id
                    const newHref = originalHref.replace(`/profile/${username}`, `/profile/${uuid}`)

                    const pluginState = resolveViewRef.view
                    if (!pluginState)
                      return

                    const currentState = pluginState.state
                    const updateTr = currentState.tr
                    let found = false
                    currentState.doc.descendants((n, p) => {
                      if (n.type.name === 'linkEmbed' && n.attrs.href === originalHref) {
                        updateTr.setNodeMarkup(p, undefined, { href: newHref })
                        found = true
                      }
                    })
                    if (found)
                      pluginState.dispatch(updateTr)
                  })
              }
            }, 0)
          }

          return changed ? tr : null
        },
      }),
      new Plugin({
        key: new PluginKey('linkEmbedViewRef'),
        view(editorView) {
          resolveViewRef.view = editorView
          return {
            destroy() {
              resolveViewRef.view = null
            },
          }
        },
      }),
    ]
  },
})
