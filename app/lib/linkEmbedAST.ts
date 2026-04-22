// ---------------------------------------------------------------------------
// AST-level link embed transform (used by MarkdownRendererInner)
// ---------------------------------------------------------------------------
// Walks the parsed MDC AST and replaces any top-level <p> that contains only
// a single <a href="..."> pointing at a recognised internal hivecom URL with a
// <SharedLinkEmbed url="..."> component node.  All other nodes are untouched.
// ---------------------------------------------------------------------------

import { parseInternalUrl } from '@/composables/useDataLinkPreview'

interface ASTNode {
  type: string
  tag?: string
  props?: Record<string, unknown>
  children?: ASTNode[]
  value?: string
}

/**
 * Returns true if `node` is a <p> whose only meaningful child is a single <a>
 * pointing at a recognised internal hivecom URL.
 *
 * "Meaningful" means non-whitespace text nodes and non-comment nodes.
 * MDC emits comment nodes as `{ type: 'comment' }` in the AST.
 */
function isStandaloneLinkParagraph(node: ASTNode): boolean {
  if (node.type !== 'element' || node.tag !== 'p')
    return false

  const meaningful = (node.children ?? []).filter(
    c => !(c.type === 'text' && (c.value ?? '').trim() === '')
      && c.type !== 'comment',
  )

  if (meaningful.length !== 1)
    return false

  const child = meaningful[0]!
  if (child.type !== 'element' || child.tag !== 'a')
    return false

  const href = child.props?.href
  if (typeof href !== 'string')
    return false

  return parseInternalUrl(href) !== null
}

function getHref(node: ASTNode): string {
  const meaningful = (node.children ?? []).filter(
    c => !(c.type === 'text' && (c.value ?? '').trim() === '')
      && c.type !== 'comment',
  )
  const anchor = meaningful[0]!
  return anchor.props?.href as string
}

/**
 * Walk the root AST body and replace standalone internal-link paragraphs with
 * `<SharedLinkEmbed url="...">` component nodes.
 */
export function transformLinkEmbeds(body: ASTNode): ASTNode {
  if (!body.children)
    return body

  const newChildren: ASTNode[] = body.children.map((node) => {
    if (!isStandaloneLinkParagraph(node))
      return node

    const href = getHref(node)

    return {
      type: 'element',
      tag: 'SharedLinkEmbed',
      props: { url: href },
      children: [],
    }
  })

  return { ...body, children: newChildren }
}
