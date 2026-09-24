// ---------------------------------------------------------------------------
// AST-level grouping, before MDCRenderer sees the tree
// ------------------------------------------------------------------------
interface ASTNode {
  type: string
  tag?: string
  props?: Record<string, unknown>
  children?: ASTNode[]
  value?: string
}

function isSoloVideoASTNode(node: ASTNode): boolean {
  // rehype stores class as props.className, a string array.
  if (node.type === 'element' && node.tag === 'div') {
    const cls = node.props?.className ?? node.props?.class
    if (typeof cls === 'string')
      return cls.split(' ').includes('md-video-embed')
    if (Array.isArray(cls))
      return (cls as string[]).includes('md-video-embed')
  }

  // Raw HTML node, when MDC doesn't parse the HTML.
  if ((node.type === 'raw' || node.type === 'html') && typeof node.value === 'string')
    return node.value.trimStart().startsWith('<div class="md-video-embed">')

  return false
}

function isSoloImageASTNode(node: ASTNode): boolean {
  if (node.type !== 'element' || node.tag !== 'p')
    return false

  const kids = (node.children ?? []).filter(
    c => !(c.type === 'text' && (c.value ?? '').trim() === ''),
  )
  return kids.length === 1 && kids[0]?.type === 'element' && kids[0]?.tag === 'img'
}

// A <p> of only images gets split so the grouping pass can pick them up.
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

// Gallery tiles shouldn't show the native controls bar.
function stripVideoControls(node: ASTNode): ASTNode {
  if ((node.type === 'raw' || node.type === 'html') && typeof node.value === 'string') {
    return { ...node, value: node.value.replace(/\s+controls(?:="[^"]*")?/g, '') }
  }
  if (node.type === 'element' && node.tag === 'div') {
    return {
      ...node,
      children: (node.children ?? []).map((child) => {
        if (child.tag === 'video') {
          const { controls: _controls, ...restProps } = child.props ?? {}
          return { ...child, props: restProps }
        }
        return child
      }),
    }
  }
  return node
}

// Grouping in the AST, rather than the DOM, means Vue renders the groups
// natively and never patches them away.
export function groupImagesAST(body: ASTNode): ASTNode {
  if (!body.children)
    return body

  // Images with no blank line between them in the source share one <p>.
  const flatChildren: ASTNode[] = []
  for (const child of body.children) {
    flatChildren.push(...splitMultiImageASTNode(child))
  }

  const newChildren: ASTNode[] = []
  let i = 0

  while (i < flatChildren.length) {
    const node = flatChildren[i]!

    if (!isSoloImageASTNode(node) && !isSoloVideoASTNode(node)) {
      newChildren.push(node)
      i++
      continue
    }

    const run: ASTNode[] = []
    let j = i
    while (j < flatChildren.length && (isSoloImageASTNode(flatChildren[j]!) || isSoloVideoASTNode(flatChildren[j]!))) {
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
        children: run.map(n => isSoloVideoASTNode(n) ? stripVideoControls(n) : n),
      })
    }

    i = j
  }

  return { ...body, children: newChildren }
}

// ---------------------------------------------------------------------------
// DOM-level grouping, for the ProseMirror editor
// ------------------------------------------------------------------------
function splitMultiImageNode(node: HTMLElement, container: HTMLElement): void {
  const kids = [...node.childNodes].filter(
    n => !(n.nodeType === Node.TEXT_NODE && n.textContent?.trim() === ''),
  )
  if (kids.length < 2)
    return
  if (!kids.every(n => n instanceof HTMLElement && n.tagName === 'IMG'))
    return

  for (const img of kids) {
    const p = document.createElement('p')
    p.appendChild(img.cloneNode(true))
    container.insertBefore(p, node)
  }
  container.removeChild(node)
}

// A bare <img> is what ProseMirror emits. The <p> and video embed forms come
// from the MDC renderer.
function isSoloImageNode(node: ChildNode): node is HTMLElement {
  if (!(node instanceof HTMLElement))
    return false

  if (node.tagName === 'IMG')
    return true

  if (node.tagName === 'DIV' && node.classList.contains('md-video-embed'))
    return true

  if (node.tagName === 'P') {
    const kids = [...node.childNodes].filter(
      n => !(n.nodeType === Node.TEXT_NODE && n.textContent?.trim() === ''),
    )
    return kids.length === 1 && kids[0] instanceof HTMLElement && kids[0].tagName === 'IMG'
  }

  return false
}

// One group per run. CSS grid handles the columns, so JS chunking can't leave
// orphaned odd images. Idempotent.
export function groupImages(container: HTMLElement): void {
  for (const group of [...container.querySelectorAll('.md-image-group')]) {
    const parent = group.parentNode
    if (!parent)
      continue

    while (group.firstChild) {
      parent.insertBefore(group.firstChild, group)
    }
    parent.removeChild(group)
  }

  // ProseMirror re-injects gap cursors on the next transaction.
  for (const gap of [...container.querySelectorAll('.ProseMirror-gapcursor')]) {
    gap.parentNode?.removeChild(gap)
  }

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

    const run: HTMLElement[] = []
    let j = i
    while (j < children.length && isSoloImageNode(children[j]!)) {
      run.push(children[j]! as HTMLElement)
      j++
    }

    if (run.length < 2) {
      i++
      continue
    }

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
