// ---------------------------------------------------------------------------
// AST-level table wrapping (used by MarkdownRendererInner before MDCRenderer sees it)
// ---------------------------------------------------------------------------

interface ASTNode {
  type: string
  tag?: string
  props?: Record<string, unknown>
  children?: ASTNode[]
  value?: string
}

// Recursively walk the AST and wrap every <table> node in a
// <div class="table-scroll-wrapper"> so wide tables scroll horizontally
// instead of widening the parent container.
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
      // Recurse into any other element that may contain tables
      if (node.type === 'element' && (node.children?.length ?? 0) > 0)
        return wrapTablesAST(node)
      return node
    }),
  }
}
