import type { JSONContent } from '@tiptap/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EditorView } from '@tiptap/pm/view'
import { Node } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { parseInternalUrl } from '@/composables/useDataLinkPreview'

// ---------------------------------------------------------------------------
// LinkEmbed node extension
//
// A block-level atom node that represents a standalone internal hivecom link
// rendered as a minimal embed card inside the Tiptap editor.
//
// Markdown serialization: bare URL on its own line so that:
//   1. getEditorMarkdown() stores it cleanly in the content model
//   2. transformLinkEmbeds() in linkEmbedAST.ts converts it to a
//      <SharedLinkEmbed> component node when the markdown is rendered.
//
// A ProseMirror appendTransaction plugin watches every document change and
// converts any paragraph whose only content is a single self-linked text node
// pointing at a recognised internal hivecom URL into a linkEmbed node.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * If `node` is a paragraph containing only a single text node that:
 *   - has exactly one mark of type "link"
 *   - whose text content equals the link href (i.e. a self-link / bare URL)
 *   - and the href is a recognised internal hivecom URL
 *
 * ...returns the href string. Otherwise returns null.
 */
function getStandaloneLinkHref(node: import('@tiptap/pm/model').Node): string | null {
  if (node.type.name !== 'paragraph')
    return null

  // Paragraph must have exactly one child
  if (node.childCount !== 1)
    return null

  const child = node.firstChild
  if (!child || child.type.name !== 'text')
    return null

  // That child must carry exactly one mark
  if (child.marks.length !== 1)
    return null

  const mark = child.marks[0]!
  if (mark.type.name !== 'link')
    return null

  const href = mark.attrs.href as string | null | undefined
  if (href == null || href === '')
    return null

  // Text content must equal the href (self-link, not a custom label)
  if (child.text !== href)
    return null

  // Must be a recognised internal URL
  if (!parseInternalUrl(href))
    return null

  return href
}

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

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
      ? isLinkedReply ? 'Forum discussion · Linked reply' : 'Forum discussion'
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

  // Serialize back to a bare URL so getEditorMarkdown()'s SELF_LINK_RE is not
  // needed for this path, and the AST transform picks it up cleanly.
  renderMarkdown(node: JSONContent): string {
    return (node.attrs?.href as string | null | undefined) ?? ''
  },

  // ProseMirror plugin: watch transactions and auto-convert standalone
  // internal-link paragraphs into linkEmbed nodes.
  addProseMirrorPlugins() {
    const nodeType = this.type
    // Grab supabase client once - available via Nuxt's auto-import at runtime.
    let supabase: SupabaseClient | null = null
    try {
      supabase = useSupabaseClient() as SupabaseClient
    }
    catch {
      // Not in a Nuxt context (e.g. SSR or tests) - skip UUID resolution.
    }
    // Mutable ref shared between the two plugins below so the async callback
    // can dispatch into the live EditorView after UUID resolution.
    const resolveViewRef: { view: EditorView | null } = { view: null }

    return [
      new Plugin({
        key: new PluginKey('linkEmbedAutoConvert'),
        appendTransaction(transactions, _oldState, newState) {
          // Only act when the document actually changed
          if (!transactions.some(tr => tr.docChanged))
            return null

          const tr = newState.tr
          let changed = false
          // Collect username-based profile hrefs that need UUID resolution.
          const toResolve: Array<{ username: string, originalHref: string }> = []

          newState.doc.descendants((node, pos) => {
            const href = getStandaloneLinkHref(node)
            if (href == null || href === '')
              return

            tr.replaceWith(pos, pos + node.nodeSize, nodeType.create({ href }))
            changed = true

            if (supabase != null) {
              const parsed = parseInternalUrl(href)
              if (parsed?.type === 'profile' && parsed.username != null)
                toResolve.push({ username: parsed.username, originalHref: href })
            }
          })

          // After the sync transaction is applied, fire async UUID lookups.
          // We use setTimeout so the view is fully updated before we dispatch.
          if (supabase != null && toResolve.length > 0) {
            const client = supabase
            setTimeout(() => {
              for (const { username, originalHref } of toResolve) {
                client
                  .from('profiles')
                  .select('id')
                  .eq('username', username)
                  .maybeSingle()
                  .then(({ data }) => {
                    if (!data?.id)
                      return
                    const uuid = data.id
                    const newHref = originalHref.replace(`/profile/${username}`, `/profile/${uuid}`)
                    // Re-read the editor state via the plugin's stored view ref.
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
      // A tiny plugin that just holds a reference to the EditorView so the
      // async UUID resolution above can dispatch follow-up transactions.
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
