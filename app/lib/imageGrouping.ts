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
