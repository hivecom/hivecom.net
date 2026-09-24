// ---------------------------------------------------------------------------
// AST-level table wrapping, before MDCRenderer sees the tree
// ------------------------------------------------------------------------
interface ASTNode {
  type: string
  tag?: string
  props?: Record<string, unknown>
  children?: ASTNode[]
  value?: string
}

// Wide tables scroll horizontally instead of widening the parent container.
export function wrapTablesAST(body: ASTNode): ASTNode {
  if (!body.children)
    return body

  return {
    ...body,
    children: body.children.map((node) => {
      if (node.type === 'element' && node.tag === 'table') {
        return {
          type: 'element',
          tag: 'div',
          props: { class: 'table-scroll-wrapper vui-table-container separated-rows separated-cells outer-border' },
          children: [node],
        }
      }

      if (node.type === 'element' && (node.children?.length ?? 0) > 0)
        return wrapTablesAST(node)

      return node
    }),
  }
}
