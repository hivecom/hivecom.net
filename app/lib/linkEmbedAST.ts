// ---------------------------------------------------------------------------
// AST-level link embed transform
// ---------------------------------------------------------------------------
// A top-level <p> holding only a bare link to an internal hivecom URL becomes
// a <SharedLinkEmbed>.
// ------------------------------------------------------------------------
import { parseInternalUrl } from '@/composables/useDataLinkPreview'

interface ASTNode {
  type: string
  tag?: string
  props?: Record<string, unknown>
  children?: ASTNode[]
  value?: string
}

// MDC emits comments as `{ type: 'comment' }` nodes, so those get skipped too.
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

  // A link with its own label text stays a link.
  const anchorText = (child.children ?? [])
    .filter(c => c.type === 'text')
    .map(c => c.value ?? '')
    .join('')
    .trim()

  if (anchorText !== '' && anchorText !== href)
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
