import type { Node as PmNode } from '@tiptap/pm/model'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const MAX_PER_ROW = 3

interface ImagePos {
  from: number
  to: number
}

// Walk the top-level children of the doc and collect runs of consecutive image
// nodes. Returns slices of ImagePos arrays, each slice being one display row.
function findImageRows(doc: PmNode): ImagePos[][] {
  const rows: ImagePos[][] = []
  let currentRun: ImagePos[] = []

  doc.forEach((node, offset) => {
    if (node.type.name === 'image') {
      currentRun.push({ from: offset, to: offset + node.nodeSize })
    }
    else {
      if (currentRun.length >= 2) {
        for (let k = 0; k < currentRun.length; k += MAX_PER_ROW) {
          const row = currentRun.slice(k, k + MAX_PER_ROW)
          if (row.length >= 2)
            rows.push(row)
        }
      }
      currentRun = []
    }
  })

  // Flush trailing run.
  if (currentRun.length >= 2) {
    for (let k = 0; k < currentRun.length; k += MAX_PER_ROW) {
      const row = currentRun.slice(k, k + MAX_PER_ROW)
      if (row.length >= 2)
        rows.push(row)
    }
  }

  return rows
}

function buildDecorations(doc: PmNode): DecorationSet {
  const rows = findImageRows(doc)

  if (rows.length === 0)
    return DecorationSet.empty

  const decorations: Decoration[] = []

  for (const row of rows) {
    const total = row.length
    for (let i = 0; i < row.length; i++) {
      const { from, to } = row[i]!
      decorations.push(
        Decoration.node(from, to, {
          'data-img-run-index': String(i),
          'data-img-run-total': String(total),
        }),
      )
    }
  }

  return DecorationSet.create(doc, decorations)
}

const imageGroupKey = new PluginKey<DecorationSet>('imageGroup')

export const ImageGroup = Extension.create({
  name: 'imageGroup',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: imageGroupKey,

        state: {
          init(_, state) {
            return buildDecorations(state.doc)
          },
          apply(tr, old) {
            if (!tr.docChanged)
              return old.map(tr.mapping, tr.doc)
            return buildDecorations(tr.doc)
          },
        },

        props: {
          decorations(state) {
            return imageGroupKey.getState(state)
          },
        },
      }),
    ]
  },
})
