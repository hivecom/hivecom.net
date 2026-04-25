// ---------------------------------------------------------------------------
// AST-level grouping (used by MarkdownRendererInner before MDCRenderer sees it)
// ---------------------------------------------------------------------------

interface ASTNode {
  type: string
  tag?: string
  props?: Record<string, unknown>
  children?: ASTNode[]
  value?: string
}

function isSoloImageASTNode(node: ASTNode): boolean {
  if (node.type !== 'element' || node.tag !== 'p')
    return false
  const kids = (node.children ?? []).filter(
    c => !(c.type === 'text' && (c.value ?? '').trim() === ''),
  )
  return kids.length === 1 && kids[0]?.type === 'element' && kids[0]?.tag === 'img'
}

// If a <p> contains multiple images and nothing else, split it into individual
// solo-image <p> nodes so the grouping pass can pick them up.
function splitMultiImageASTNode(node: ASTNode): ASTNode[] {
  if (node.type !== 'element' || node.tag !== 'p')
    return [node]
  const kids = (node.children ?? []).filter(
    c => !(c.type === 'text' && (c.value ?? '').trim() === ''),
  )
  if (kids.length < 2)
    return [node]
  if (!kids.every(c => c.type === 'element' && c.tag === 'img'))
    return [node]
  return kids.map(img => ({
    type: 'element',
    tag: 'p',
    props: {},
    children: [img],
  }))
}

// Walk the root AST body and wrap runs of solo-image <p> nodes in a
// <div class="md-image-group" data-count="N"> node so that Vue renders the
// grouping natively and never patches it away.
export function groupImagesAST(body: ASTNode): ASTNode {
  if (!body.children)
    return body

  // First pass: split any <p> nodes that contain multiple consecutive images
  // into individual solo-image <p> nodes (happens when images have no blank
  // line between them in the source markdown).
  const flatChildren: ASTNode[] = []
  for (const child of body.children) {
    flatChildren.push(...splitMultiImageASTNode(child))
  }

  const newChildren: ASTNode[] = []
  let i = 0

  while (i < flatChildren.length) {
    const node = flatChildren[i]!

    if (!isSoloImageASTNode(node)) {
      newChildren.push(node)
      i++
      continue
    }

    // Collect full run of consecutive solo-image paragraphs.
    const run: ASTNode[] = []
    let j = i
    while (j < flatChildren.length && isSoloImageASTNode(flatChildren[j]!)) {
      run.push(flatChildren[j]!)
      j++
    }

    if (run.length < 2) {
      newChildren.push(...run)
    }
    else {
      newChildren.push({
        type: 'element',
        tag: 'div',
        props: { 'class': 'md-image-group', 'data-count': String(run.length) },
        children: run,
      })
    }

    i = j
  }

  return { ...body, children: newChildren }
}

// ---------------------------------------------------------------------------
// DOM-level grouping (used by the ProseMirror editor)
// ---------------------------------------------------------------------------

// If a <p> contains only <img> elements (no other non-whitespace content),
// split it into individual solo-image <p> nodes in the DOM.
function splitMultiImageNode(node: HTMLElement, container: HTMLElement): void {
  const kids = [...node.childNodes].filter(
    n => !(n.nodeType === Node.TEXT_NODE && n.textContent?.trim() === ''),
  )
  if (kids.length < 2)
    return
  if (!kids.every(n => n instanceof HTMLElement && n.tagName === 'IMG'))
    return
  // Insert individual <p><img></p> wrappers before the original node.
  for (const img of kids) {
    const p = document.createElement('p')
    p.appendChild(img.cloneNode(true))
    container.insertBefore(p, node)
  }
  container.removeChild(node)
}

// A "solo image node" is either:
// - a <p> whose only non-whitespace child is an <img>  (MDC renderer output)
// - a bare <img> that is a direct child of the container (ProseMirror output)
function isSoloImageNode(node: ChildNode): node is HTMLElement {
  if (!(node instanceof HTMLElement))
    return false

  if (node.tagName === 'IMG')
    return true

  if (node.tagName === 'P') {
    const kids = [...node.childNodes].filter(
      n => !(n.nodeType === Node.TEXT_NODE && n.textContent?.trim() === ''),
    )
    return kids.length === 1 && kids[0] instanceof HTMLElement && kids[0].tagName === 'IMG'
  }

  return false
}

// Walk a container element and wrap runs of solo-image nodes in a single
// .md-image-group div per run. CSS grid controls the column layout at each
// breakpoint - no JS chunking so there are no orphaned odd images.
// Safe to call repeatedly - cleans up previous groupings before re-running.
export function groupImages(container: HTMLElement): void {
  // Clean up any previously applied groupings so re-runs are idempotent.
  for (const group of [...container.querySelectorAll('.md-image-group')]) {
    const parent = group.parentNode
    if (!parent)
      continue
    while (group.firstChild) {
      parent.insertBefore(group.firstChild, group)
    }
    parent.removeChild(group)
  }

  // Remove gap cursors before grouping - ProseMirror re-injects them on the
  // next transaction so we don't need to preserve their positions.
  for (const gap of [...container.querySelectorAll('.ProseMirror-gapcursor')]) {
    gap.parentNode?.removeChild(gap)
  }

  // Split any <p> nodes that contain multiple consecutive images into
  // individual solo-image <p> nodes before the grouping pass.
  for (const child of [...container.childNodes]) {
    if (child instanceof HTMLElement && child.tagName === 'P')
      splitMultiImageNode(child, container)
  }

  const children = [...container.childNodes]

  let i = 0
  while (i < children.length) {
    const node = children[i]
    if (node == null || !isSoloImageNode(node)) {
      i++
      continue
    }

    // Collect the full run of consecutive solo-image nodes.
    const run: HTMLElement[] = []
    let j = i
    while (j < children.length && isSoloImageNode(children[j]!)) {
      run.push(children[j]! as HTMLElement)
      j++
    }

    if (run.length < 2) {
      // Single image - leave it alone.
      i++
      continue
    }

    // Wrap the entire run in one group. CSS grid handles column layout per
    // breakpoint so there are no orphaned images from JS-level chunking.
    const wrapper = document.createElement('div')
    wrapper.className = 'md-image-group'
    wrapper.dataset.count = String(run.length)
    container.insertBefore(wrapper, run[0] ?? null)
    for (const p of run) {
      wrapper.appendChild(p)
    }

    i = j
  }
}
