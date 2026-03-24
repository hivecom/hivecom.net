<script setup lang="ts">
import type { JSONContent } from '@tiptap/core'
import type { StorageBucketId } from '@/lib/storageAssets'
import type { Database } from '@/types/database.types'
import { useSupabaseClient } from '#imports'
import { Button, ButtonGroup, Dropdown, DropdownItem, pushToast, Tooltip } from '@dolanske/vui'
import { Extension } from '@tiptap/core'
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import Image from '@tiptap/extension-image'
import { Mathematics } from '@tiptap/extension-mathematics'
import { TableCell } from '@tiptap/extension-table/cell'
import { TableHeader } from '@tiptap/extension-table/header'
import { TableRow } from '@tiptap/extension-table/row'
import { Table } from '@tiptap/extension-table/table'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import Youtube from '@tiptap/extension-youtube'
import { CharacterCount } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { marked } from 'marked'
import { computed, nextTick, ref, useId, watch } from 'vue'
import ContentRulesModal from '@/components/Shared/ContentRulesModal.vue'
import { useContentRulesAgreement } from '@/composables/useContentRulesAgreement'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { allowedMediaExtensions, allowedMediaTypes, allowedVideoTypes, stripImageMetadata } from '@/lib/storage'
import { FORUMS_BUCKET_ID } from '@/lib/storageAssets'
import EditorMathModal from './EditorMathModal.vue'
import EditorTableMenu from './EditorTableMenu.vue'
import EditorVideoModal from './EditorVideoModal.vue'
import EditorYoutubeModal from './EditorYoutubeModal.vue'
import { ImageGroup } from './plugins/imageGroup'
import { createMentionExtension, hydrateMentionLabels, resolvePlainTextMentions } from './plugins/mentions'
import { TextColor } from './plugins/textColor'
import { TextFont } from './plugins/textFont'
import { TextSize } from './plugins/textSize'
import { Video } from './plugins/video'
import RichTextMediaMenu from './RichTextMediaMenu.vue'
import RichTextSelectionMenu from './RichTextSelectionMenu.vue'

const {
  errors = [],
  minHeight = '47px',
  maxHeight = '66.67vh',
  ...props
} = defineProps<Props>()

const emit = defineEmits<{
  (e: 'submit'): void
}>()

const ENCODE_AMP_RE = /&/g
const ENCODE_LT_RE = /</g
const ENCODE_GT_RE = />/g
const DECODE_GT_RE = /&gt;/g
const DECODE_LT_RE = /&lt;/g
const DECODE_AMP_RE = /&amp;/g
const INLINE_HTML_TAG_RE = /^<(?:[a-z][a-z0-9-]*(?:\s[^>]*)?\/?|\/[a-z][a-z0-9-]*\s*|!--[\s\S]*?--)>/i
const NBSP_TRAILING_RE = /^&nbsp;$/gm
const NBSP_SINGLE_RE = /&nbsp;$/
const HTML_ANGLE_RE = /<([^>]*)>/g
const TRAILING_WS_RE = /(\s+)$/
const LEADING_WS_RE = /^(\s+)/

// TODO: Code block highlighting & dropdown for seleting language

// TODO: dropdown for headings

interface Props {
  autofocus?: boolean
  disabled?: boolean
  label?: string
  hint?: string
  errors?: string[]
  placeholder?: string
  minHeight?: string
  maxHeight?: string
  limit?: number
  showAttachmentButton?: boolean
  showSubmitOptions?: boolean
  contentRulesOverlayText?: string
  /**
   * If provided, it will enable media upload via pasting/dragging media files
   * into the editor. Providing a context helps with file management
   */
  mediaContext?: string
  /**
   * Optional storage bucket for uploads (defaults to forums bucket).
   */
  mediaBucketId?: StorageBucketId
  /**
   * Strip EXIF and other metadata from images before upload. Defaults to true.
   * Set to false if the original metadata must be preserved.
   */
  stripImageMetadata?: boolean
}

const { settings } = useDataUserSettings()

const editorMode = ref <'rich' | 'plain'>('rich')
const editorIsEmpty = ref(true)

const content = defineModel<string>()

// ---------------------------------------------------------------------------
// Plain-text display helpers
//
// The content model always stores HTML angle brackets escaped as &lt;/&gt; so
// that the markdown renderer never interprets them as real HTML.  When the user
// switches to the plain-text textarea we decode those entities so they see
// "<foo>" instead of "&lt;foo&gt;".  Any edits they make are re-escaped before
// being written back into the content model, preserving the invariant.
// ---------------------------------------------------------------------------

const minHeightPlain = computed(() => {
  const cssValue = Number(minHeight.slice(0, -2))
  //                vv The height & margin of the now static menu
  return `${cssValue - 28}px`
})

// When switching to plain mode, the textarea starts at 2x the rich editor height.
const plainTextStartHeight = ref<string | null>(null)

function encodeHtmlEntities(str: string): string {
  return str.replace(ENCODE_AMP_RE, '&amp;').replace(ENCODE_LT_RE, '&lt;').replace(ENCODE_GT_RE, '&gt;')
}

function decodeHtmlEntities(str: string): string {
  return str.replace(DECODE_GT_RE, '>').replace(DECODE_LT_RE, '<').replace(DECODE_AMP_RE, '&')
}

// Decoded version of `content` used exclusively by the plain-text textarea.
const plainTextContent = ref('')

function handlePlainTextInput(value: string) {
  plainTextContent.value = value
  content.value = encodeHtmlEntities(value)
}
const isNsfw = defineModel<boolean>('nsfw', { default: false })

const resolvedMediaBucketId = computed(() => props.mediaBucketId ?? FORUMS_BUCKET_ID)

const supabase = useSupabaseClient<Database>()

const { agreed: fetchedContentRulesAgreement, markAgreed } = useContentRulesAgreement()

// Flag used to suppress image-cleanup logic when content is replaced externally
// (e.g. via the watch(content) handler). ProseMirror dispatches transactions
// synchronously so a plain boolean is safe here.
let externalContentUpdate = false

/**
 * Extract the Supabase storage path from a public image URL.
 * Public URL format: {origin}/storage/v1/object/public/{bucket}/{path}
 * Returns null when the URL doesn't match our storage or bucket.
 */
function extractStoragePath(src: string, bucketId: string): string | null {
  const marker = `/storage/v1/object/public/${bucketId}/`
  const idx = src.indexOf(marker)
  if (idx === -1)
    return null
  // Strip any query-string parameters that Supabase may append
  return decodeURIComponent((src.slice(idx + marker.length).split('?').at(0)) ?? '')
}

// ---------------------------------------------------------------------------
// Math modal state (declared before useEditor so the extension onClick
// callbacks can close over these reactive refs at setup time)
// ---------------------------------------------------------------------------
const mathModalOpen = ref(false)
const mathModalLatex = ref('')
const mathModalType = ref<'inline' | 'block'>('inline')
const mathModalEditPos = ref<number | null>(null)

// YouTube modal state
const youtubeModalOpen = ref(false)

// Video modal state (insert by URL)
const videoModalOpen = ref(false)

// A custom marked instance that intercepts inline HTML tokens so that raw tags
// typed or pasted into the editor are treated as literal text rather than being
// parsed as real HTML nodes.
//
// marked's inline `tag` tokenizer produces `type: "html"` tokens for anything
// matching `<tagname ...>`. @tiptap/markdown receives those and calls
// generateJSON() on them, which silently drops unrecognised tag names and
// swallows their inner content (e.g. `<tag>example</tag>` → `example` or
// nothing at all).
//
// The single inline extension below intercepts those tokens before marked emits
// them and re-emits them as `type: "text"` instead, so `<foo>bar</foo>` is
// stored as the literal visible string `<foo>bar</foo>` in the Tiptap editor.
// getEditorMarkdown() then escapes the raw angle brackets to `&lt;`/`&gt;`
// on the way out so the markdown renderer never interprets them as HTML.
const noHtmlMarked = marked.use({
  extensions: [
    {
      // Inline-level HTML: intercepts marked's `tag` rule (inline HTML like
      // `<b>`, `</em>`, `<br/>`) before it produces an `html` token.
      // We re-emit it as a `text` token so the angle-bracket sequence is
      // stored verbatim and never handed to @tiptap/markdown's HTML parser.
      name: 'stripInlineHtml',
      level: 'inline',
      start(src: string) {
        return src.indexOf('<')
      },
      tokenizer(src: string) {
        // Matches any inline HTML tag: opening, closing, self-closing, or comment.
        const match = INLINE_HTML_TAG_RE.exec(src)
        if (match) {
          return {
            type: 'text',
            raw: match[0],
            text: match[0],
          }
        }
      },
    },
  ],
})

const editor = useEditor({
  content: content.value,
  extensions: [
    StarterKit,
    Markdown.configure({ marked: noHtmlMarked }),
    Image,
    ImageGroup,
    // Ctrl+Enter to submit
    Extension.create({
      name: 'submitShortcut',
      addKeyboardShortcuts() {
        return {
          'Mod-Enter': () => {
            handleSubmit()
            return true
          },
        }
      },
    }),
    // Text color (triple-colon directive: :::color[name]text:::)
    TextColor,
    // Text font family (triple-colon directive: :::font[name]text:::)
    TextFont,
    // Text font size (triple-colon directive: :::size[name]text:::)
    TextSize,
    // Checklist / task list support (markdown: - [ ] / - [x])
    TaskList,
    TaskItem.configure({ nested: true }),
    // User mentions
    createMentionExtension(supabase),

    // Media content setting for file uploads.
    // We roll our own plugin instead of using @tiptap/extension-file-handler
    // because that extension returns false (not consumed) when the clipboard
    // also contains text/html - which lets ProseMirror's default paste handler
    // run afterward and insert a raw image link. We need to return true to
    // fully consume the event whenever we handle the files ourselves.
    ...(props.mediaContext
      ? [Extension.create({
          name: 'mediaUpload',
          addProseMirrorPlugins() {
            return [
              new Plugin({
                key: new PluginKey('mediaUpload'),
                props: {
                  handlePaste(_view, event) {
                    const cd = event.clipboardData
                    if (!cd)
                      return false

                    // Collect files from both .files and .items (the latter
                    // catches screenshots and images copied from other apps
                    // where .files may be empty).
                    let files: File[] = [...cd.files]
                    if (files.length === 0) {
                      files = [...cd.items]
                        .filter(item => item.kind === 'file')
                        .map(item => item.getAsFile())
                        .filter((f): f is File => f !== null)
                    }

                    const allowed = files.filter(f => allowedMediaTypes.includes(f.type))
                    if (allowed.length === 0)
                      return false

                    event.preventDefault()
                    event.stopPropagation()
                    handleFileUpload(allowed)
                    return true
                  },
                  handleDrop(_view, event) {
                    const dt = event.dataTransfer
                    if (!dt?.files.length)
                      return false

                    const files = [...dt.files].filter(f => allowedMediaTypes.includes(f.type))
                    if (files.length === 0)
                      return false

                    const pos = _view.posAtCoords({ left: event.clientX, top: event.clientY })
                    event.preventDefault()
                    event.stopPropagation()
                    handleFileUpload(files, pos?.pos)
                    return true
                  },
                },
              }),
            ]
          },
        })]
      : []),
    // Character limit
    ...(props.limit
      ? [CharacterCount.configure({ limit: props.limit })]
      : []),
    // LaTeX math (inline & block) via KaTeX
    Mathematics.configure({
      inlineOptions: {
        onClick: (node, pos) => {
          mathModalLatex.value = String(node.attrs.latex ?? '')
          mathModalType.value = 'inline'
          mathModalEditPos.value = pos
          mathModalOpen.value = true
        },
      },
      blockOptions: {
        onClick: (node, pos) => {
          mathModalLatex.value = String(node.attrs.latex ?? '')
          mathModalType.value = 'block'
          mathModalEditPos.value = pos
          mathModalOpen.value = true
        },
      },
      katexOptions: {
        throwOnError: false,
      },
    }),
    // YouTube embeds
    Youtube.configure({
      nocookie: true,
      width: 640,
      height: 360,
      allowFullscreen: true,
    }),
    // Uploaded video embeds (:::video {src="..."} ::: directive)
    Video,
    // Spoiler / collapsible blocks via the HTML <details> element
    Details.configure({ persist: true }),
    DetailsSummary,
    DetailsContent,
    // Tables
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
  ],
  contentType: 'markdown',
  onCreate: () => {
    // Patch MarkdownManager.renderNodesWithMarkBoundaries to compare mark attrs,
    // not just mark types. The library's findMarksToClose / findMarksToCloseAtEnd
    // only check whether the same mark *type* exists on the next text node. When
    // two adjacent nodes carry the same mark type with different attrs (e.g.
    // textColor red → orange), the library never closes the first mark or opens
    // the second, producing merged output like :::color[red]Testing::: instead of
    // :::color[red]Test::::::color[orange]ing:::. Patching the instance method is
    // the least invasive fix since the standalone helper functions called inside
    // the method can't be swapped individually.
    if (editor.value?.markdown) {
      const mgr = editor.value.markdown as unknown as {
        renderNodesWithMarkBoundaries: (
          nodes: JSONContent[],
          parentNode: JSONContent | null,
          separator?: string,
          level?: number,
        ) => string
        getMarkOpening: (markType: string, mark: { type: string, attrs?: Record<string, unknown> }) => string
        getMarkClosing: (markType: string, mark: { type: string, attrs?: Record<string, unknown> }) => string
        renderNodeToMarkdown: (node: JSONContent, parentNode: JSONContent | null, index: number, level: number) => string
      }

      interface MarkEntry { type: string, attrs?: Record<string, unknown> }

      function marksEqual(a: MarkEntry | undefined, b: MarkEntry | undefined): boolean {
        if (!a || !b)
          return a === b
        return a.type === b.type && JSON.stringify(a.attrs ?? {}) === JSON.stringify(b.attrs ?? {})
      }

      const originalRender = mgr.renderNodesWithMarkBoundaries.bind(mgr)

      mgr.renderNodesWithMarkBoundaries = (
        nodes: JSONContent[],
        parentNode: JSONContent | null,
        separator = '',
        level = 0,
      ): string => {
        // Check whether any node pair has same-type-different-attrs marks.
        // If not, skip the patch entirely and use the original (faster) path.
        let needsPatch = false
        for (let idx = 0; idx < nodes.length - 1; idx++) {
          const a = nodes[idx]
          const b = nodes[idx + 1]
          if (!a || !b || a.type !== 'text' || b.type !== 'text')
            continue
          const aMarks = (a.marks ?? []) as MarkEntry[]
          const bMarks = (b.marks ?? []) as MarkEntry[]
          for (const am of aMarks) {
            const bm = bMarks.find(m => m.type === am.type)
            if (bm && !marksEqual(am, bm)) {
              needsPatch = true
              break
            }
          }
          if (needsPatch)
            break
        }
        if (!needsPatch)
          return originalRender(nodes, parentNode, separator, level)

        // Attrs-aware rendering: close and reopen marks whenever attrs differ.
        const result: string[] = []
        const activeMarks = new Map<string, MarkEntry>()

        nodes.forEach((node, i) => {
          const nextNode: JSONContent | null = (i < nodes.length - 1 ? nodes[i + 1] : null) ?? null

          if (!node.type)
            return

          if (node.type === 'text') {
            let text = node.text ?? ''
            const currentMarks = new Map(
              ((node.marks ?? []) as MarkEntry[]).map(m => [m.type, m]),
            )

            // Determine which active marks need closing: mark absent from
            // current node OR same type but attrs changed.
            const toClose: string[] = []
            for (const [type, activeMark] of activeMarks) {
              const cur = currentMarks.get(type)
              if (!cur || !marksEqual(activeMark, cur))
                toClose.push(type)
            }

            // Determine which current marks need opening: not active, or
            // active with different attrs (i.e. was just closed above).
            const toOpen: Array<{ type: string, mark: MarkEntry }> = []
            for (const [type, mark] of currentMarks) {
              const active = activeMarks.get(type)
              if (!active || !marksEqual(active, mark))
                toOpen.push({ type, mark })
            }

            // Close marks (reverse order for proper nesting)
            let trailingWs = ''
            if (toClose.length > 0) {
              const wsMatch = text.match(TRAILING_WS_RE)
              if (wsMatch) {
                trailingWs = wsMatch[1] ?? ''
                text = text.slice(0, -trailingWs.length)
              }
            }
            for (const type of toClose.toReversed()) {
              const mark = activeMarks.get(type)
              if (mark) {
                text += mgr.getMarkClosing(type, mark)
              }
              activeMarks.delete(type)
            }

            // Open marks
            let leadingWs = ''
            if (toOpen.length > 0) {
              const wsMatch = text.match(LEADING_WS_RE)
              if (wsMatch) {
                leadingWs = wsMatch[1] ?? ''
                text = text.slice(leadingWs.length)
              }
            }
            for (const { type, mark } of toOpen) {
              const open = mgr.getMarkOpening(type, mark)
              if (open)
                text = open + text
              activeMarks.set(type, mark)
            }
            text = leadingWs + text

            // Close marks that shouldn't persist to the next node: mark not
            // on the next node at all, or same type but different attrs.
            const toCloseAtEnd: string[] = []
            for (const [type, activeMark] of activeMarks) {
              const nextMarks = (nextNode?.marks ?? []) as MarkEntry[]
              const nm = nextMarks.find(m => m.type === type)
              if (!nm || !marksEqual(activeMark, nm))
                toCloseAtEnd.push(type)
            }

            let endTrailingWs = ''
            if (toCloseAtEnd.length > 0) {
              const wsMatch = text.match(TRAILING_WS_RE)
              if (wsMatch) {
                endTrailingWs = wsMatch[1] ?? ''
                text = text.slice(0, -endTrailingWs.length)
              }
            }
            for (const type of toCloseAtEnd.toReversed()) {
              const mark = activeMarks.get(type)
              if (mark) {
                text += mgr.getMarkClosing(type, mark)
              }
              activeMarks.delete(type)
            }

            text += endTrailingWs + trailingWs
            result.push(text)
          }
          else {
            // Non-text node: close all active marks, render the node, reopen.
            let before = ''
            for (const [type, mark] of [...activeMarks.entries()].toReversed()) {
              before += mgr.getMarkClosing(type, mark)
            }
            const savedMarks = new Map(activeMarks)
            activeMarks.clear()

            const content = mgr.renderNodeToMarkdown(node, parentNode, i, level)

            let after = ''
            if (node.type !== 'hardBreak') {
              for (const [type, mark] of savedMarks) {
                const open = mgr.getMarkOpening(type, mark)
                if (open)
                  after += open
                activeMarks.set(type, mark)
              }
            }
            result.push(before + content + after)
          }
        })

        return result.join(separator)
      }
    }

    // Synchronise the Vue-level empty flag once the editor is fully initialised.
    // Using nextTick ensures EditorContent has attached the view to the visible
    // DOM so any subsequent reactive renders see the correct state.
    nextTick(() => {
      editorIsEmpty.value = editor.value?.isEmpty ?? true
    })
  },
  onUpdate: () => {
    editorIsEmpty.value = editor.value?.isEmpty ?? true
    // @tiptap/extension-paragraph serialises an empty paragraph as "&nbsp;"
    // so that round-trip parsing keeps the paragraph intact. We never want
    // that sentinel to leak into the content model – an empty editor should
    // always produce an empty string. getEditorMarkdown() strips the sentinel
    // from both fully-empty editors and trailing empty paragraphs.
    content.value = getEditorMarkdown()
  },
  onTransaction: ({ transaction }) => {
    // Only act when the doc actually changed, we have a media context, and
    // this isn't a programmatic content replacement.
    if (!transaction.docChanged || !props.mediaContext || externalContentUpdate)
      return

    // Collect image and video srcs present in the document before this transaction
    const prevSrcs = new Set<string>()
    transaction.before.descendants((node) => {
      if ((node.type.name === 'image' || node.type.name === 'video') && typeof node.attrs.src === 'string')
        prevSrcs.add(node.attrs.src)
    })

    if (prevSrcs.size === 0)
      return

    // Collect image and video srcs present in the document after this transaction
    const nextSrcs = new Set<string>()
    transaction.doc.descendants((node) => {
      if ((node.type.name === 'image' || node.type.name === 'video') && typeof node.attrs.src === 'string')
        nextSrcs.add(node.attrs.src)
    })

    // For every src that disappeared, attempt to remove it from storage
    for (const src of prevSrcs) {
      if (nextSrcs.has(src))
        continue

      const storagePath = extractStoragePath(src, resolvedMediaBucketId.value)
      if (!storagePath)
        continue

      // Only delete files that belong to the current media context
      if (!storagePath.startsWith(`${props.mediaContext}/`))
        continue

      void supabase.storage
        .from(resolvedMediaBucketId.value)
        .remove([storagePath])
        .then(({ error }) => {
          if (error)
            pushToast('Error deleting media', { description: error.message })
        })
    }
  },
})

/**
 * Tiptap's markdown serializer emits "&nbsp;" for every empty paragraph so
 * that the paragraph survives a round-trip through the parser. This is fine
 * for the editor's internal use, but we must never let that sentinel leak into
 * the content model that is stored/displayed outside the editor.
 *
 * This helper strips any trailing "&nbsp;" (with optional preceding newlines)
 * that the serializer appended, then falls back to an empty string when the
 * result is blank – matching what the `isEmpty` fast-path already does for a
 * fully-empty editor.
 */
function getEditorMarkdown(): string {
  if (!editor.value || editor.value.isEmpty)
    return ''
  const raw = editor.value.getMarkdown() ?? ''
  // @tiptap/extension-paragraph emits "&nbsp;" for every empty paragraph -
  // not just the trailing one - so we must replace all of them.
  // A line whose only content is "&nbsp;" represents an empty paragraph;
  // replace it with a genuinely empty line so the plain-text view is clean.
  // We also strip a lone trailing "&nbsp;" that has no preceding newline
  // (single-paragraph empty doc edge-case).
  const stripped = raw
    .replace(NBSP_TRAILING_RE, '')
    .replace(NBSP_SINGLE_RE, '')
    // Escape any HTML tag-like sequences (<...>) so they are stored and rendered
    // as visible literal text rather than being interpreted as HTML by the
    // markdown renderer. Tiptap now stores these as raw angle-bracket text nodes
    // (the noHtmlMarked inline interceptor prevents them from being parsed as
    // real HTML on input), so we must re-escape them on the way out.
    .replace(HTML_ANGLE_RE, '&lt;$1&gt;')
  return stripped.trim() === '' ? '' : stripped
}

// Upload file into the bucket and set the editor node URL.
//
// Strategy: insert a blob URL placeholder immediately so the user sees a
// preview (image) or spinner (video) while the upload is in-flight.  When the
// upload completes we swap the blob src for the real Supabase URL in-place
// using updateAttributes.  On failure we delete the placeholder node.
//
// The blob URL is intentionally NOT a Supabase storage URL, so extractStoragePath
// returns null for it and the onTransaction cleanup handler leaves it alone.
function handleFileUpload(files: File[] | null, pos?: number) {
  if (!files)
    return

  files.forEach(async (originalFile) => {
    if (!editor.value)
      return

    const isVideo = allowedVideoTypes.includes(originalFile.type)
    const nodeType = isVideo ? 'video' : 'image'

    // Strip EXIF/metadata from images unless the caller explicitly opts out via
    // prop, or the user has disabled it in their settings.
    const shouldStrip = !isVideo
      && props.stripImageMetadata !== false
      && settings.value.strip_image_metadata !== false
    const file = shouldStrip
      ? await stripImageMetadata(originalFile)
      : originalFile

    // Create a local object URL so we can insert a placeholder immediately.
    const blobUrl = URL.createObjectURL(file)
    const insertPos = pos ?? editor.value.state.selection.anchor

    // Insert the placeholder without selecting it - we don't want the bubble
    // menu popping up mid-upload, and we don't want the node highlighted.
    // CSS targets img[src^="blob:"] / video[src^="blob:"] to show a spinner.
    editor.value
      .chain()
      .insertContentAt(insertPos, {
        type: nodeType,
        attrs: { src: blobUrl },
      }, { updateSelection: false })
      .focus()
      .run()

    const format = file.type.split('/')[1]
    const fileUrl = `${props.mediaContext}/${crypto.randomUUID()}.${format}`

    const { error } = await supabase.storage
      .from(resolvedMediaBucketId.value)
      .upload(fileUrl, file, { contentType: file.type })

    // Revoke the object URL now that we're done with it either way.
    URL.revokeObjectURL(blobUrl)

    if (error) {
      // Remove the placeholder node - find it by its blob src.
      const editorRef = editor.value
      if (editorRef) {
        editorRef.state.doc.descendants((node, nodePos) => {
          if (node.type.name === nodeType && node.attrs.src === blobUrl) {
            editorRef
              .chain()
              .deleteRange({ from: nodePos, to: nodePos + node.nodeSize })
              .run()
            return false
          }
        })
      }
      pushToast('Error uploading media', {
        description: error.message,
      })
    }
    else {
      const { data } = supabase.storage
        .from(resolvedMediaBucketId.value)
        .getPublicUrl(fileUrl)

      // Swap the blob placeholder src for the real public URL in-place.
      // Walk the doc to find the node by its current blob src since the
      // position may have shifted due to other edits during the upload.
      const editorRef = editor.value
      if (editorRef) {
        editorRef.state.doc.descendants((node, nodePos) => {
          if (node.type.name === nodeType && node.attrs.src === blobUrl) {
            editorRef
              .chain()
              .setNodeSelection(nodePos)
              .updateAttributes(nodeType, { src: data.publicUrl })
              .setTextSelection(nodePos + node.nodeSize)
              .focus()
              .run()
            return false
          }
        })
      }
    }
  })
}

// Converts the FileList from @input event into a File[]

const fileInput = useTemplateRef('file-input')
const plainTextarea = useTemplateRef<HTMLTextAreaElement>('plain-textarea')
function handleFileInput(event: Event) {
  const files = (event.target as HTMLInputElement).files
  if (!files)
    return
  handleFileUpload([...files])
}

// Insert or update a math node (called from EditorMathModal)
function handleMathConfirm(payload: { latex: string, type: 'inline' | 'block', editPos: number | null }) {
  if (!editor.value)
    return

  if (payload.editPos != null) {
    // Update an existing math node
    if (payload.type === 'inline') {
      editor.value.chain().setNodeSelection(payload.editPos).updateInlineMath({ latex: payload.latex }).focus().run()
    }
    else {
      editor.value.chain().setNodeSelection(payload.editPos).updateBlockMath({ latex: payload.latex }).focus().run()
    }
  }
  else {
    // Insert a new math node at current selection
    if (payload.type === 'inline') {
      editor.value.commands.insertInlineMath({ latex: payload.latex })
    }
    else {
      editor.value.commands.insertBlockMath({ latex: payload.latex })
    }
  }
}

// Insert a YouTube embed (called from EditorYoutubeModal)
function handleYoutubeConfirm(url: string) {
  if (!editor.value || !url.trim())
    return
  editor.value.commands.setYoutubeVideo({ src: url.trim() })
}

// Insert a 3x3 table with a header row
function handleInsertTable() {
  editor.value?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
}

// Insert a video node by URL (called from EditorVideoModal)
function handleVideoConfirm(url: string) {
  if (!editor.value || !url.trim())
    return
  editor.value.commands.insertVideo({ src: url.trim() })
}

// If content is changed externally, make sure mentions are hydrated
watch(() => editor.value, (value) => {
  if (value) {
    hydrateMentionLabels(value, supabase, content.value ?? '')
  }
}, { immediate: true })

// Update editor content manually on model change
watch(content, (newContent) => {
  // In plain-text mode the textarea owns the content directly; do not forward
  // changes to the Tiptap editor or its onUpdate hook will fire and run
  // getEditorMarkdown(), which escapes angle brackets and writes the mangled
  // value back into the model - stripping any HTML the user just typed.
  // The plainTextContent ref is kept in sync separately via handlePlainTextInput,
  // except when content is cleared externally (e.g. after submit) - in that case
  // we must reset plainTextContent too so the textarea actually clears.
  if (editorMode.value === 'plain') {
    // Always sync external content changes into the textarea, not just clears.
    // This covers quotes, external resets, and any other programmatic writes.
    const decoded = decodeHtmlEntities(newContent ?? '')
    if (plainTextContent.value !== decoded) {
      plainTextContent.value = decoded
    }
    return
  }

  // Normalise the current editor markdown the same way onUpdate does so that
  // an empty editor (whose raw getMarkdown() returns "&nbsp;") compares equal
  // to an empty string coming from the model, preventing a spurious setContent
  // call that would trigger onUpdate and write "&nbsp;" back into the model.
  // getEditorMarkdown() also strips trailing "&nbsp;" sentinels from non-empty
  // editors that end with an empty paragraph.
  const currentMarkdown = getEditorMarkdown()
  if (currentMarkdown === (newContent ?? '')) {
    return
  }

  // Guard the onTransaction handler so it doesn't try to delete images that
  // are simply being replaced by an external content update.
  externalContentUpdate = true
  editor.value?.commands.setContent(newContent ?? '', {
    contentType: 'markdown',
  })
  externalContentUpdate = false
  editorIsEmpty.value = editor.value?.isEmpty ?? true

  void hydrateMentionLabels(editor.value, supabase, newContent ?? '')

  // If content is updated externally, focus at the end of it
  editor.value?.commands.focus('end')
})

const elementId = useId()
const contentRulesModalOpen = ref(false)
const shouldShowContentRulesOverlay = computed(() => fetchedContentRulesAgreement.value === false)

function handleContentRulesConfirmed() {
  markAgreed()
}

// Expose some methods for refs
defineExpose({
  focus: () => editor.value?.commands.focus('end'),
})

async function handleEditorModeSwitch() {
  const newMode = editorMode.value === 'rich' ? 'plain' : 'rich'

  if (newMode === 'plain') {
    // Decode stored entities so the textarea shows readable "<foo>" rather than
    // the "&lt;foo&gt;" that the content model carries internally.
    plainTextContent.value = decodeHtmlEntities(content.value ?? '')
    // Start the textarea at 2x the configured minHeight so the mode switch
    // feels intentional rather than claustrophobic.
    const cssValue = Number(minHeight.slice(0, -2))
    plainTextStartHeight.value = `${cssValue * 2}px`
  }
  else if (newMode === 'rich') {
    plainTextStartHeight.value = null
    // The model always stores the escaped form (&lt;/&gt;) for the DB/renderer.
    // Tiptap receives the decoded form (raw angle brackets) - the noHtmlMarked
    // inline interceptor converts them to plain text tokens so they are never
    // parsed as real HTML. getEditorMarkdown() then re-escapes them on the way
    // out, keeping the model invariant intact.
    const tiptapContent = plainTextContent.value
    let newContent = encodeHtmlEntities(tiptapContent)

    // Resolve any plain-text @username mentions so the Tiptap editor can
    // display and hydrate them as proper mention nodes.
    if (newContent) {
      newContent = await resolvePlainTextMentions(newContent, supabase)
    }

    // Update the model so external consumers stay in sync.
    content.value = newContent

    // Switch the mode before calling setContent so that if onUpdate fires it
    // does not immediately write back a mangled value via the plain-text guard.
    editorMode.value = newMode

    // Directly call setContent instead of relying on watch(content): the watcher
    // skips the update when newContent equals the value already in the model
    // (which is common - handlePlainTextInput keeps content in sync while the
    // user types, so by the time they switch modes the values are identical and
    // Vue never fires the watcher).
    // We pass tiptapContent (decoded, raw angle brackets) so the noHtmlMarked
    // inline interceptor can store them as literal text. getEditorMarkdown()
    // re-escapes them to &lt;/&gt; on serialization.
    externalContentUpdate = true
    editor.value?.commands.setContent(tiptapContent, { contentType: 'markdown' })
    externalContentUpdate = false
    editorIsEmpty.value = editor.value?.isEmpty ?? true

    void hydrateMentionLabels(editor.value, supabase, newContent)

    return
  }

  editorMode.value = newMode
}

async function handleSubmit() {
  if (!content.value || content.value.trim().length === 0)
    return

  if (editorMode.value === 'plain') {
    // Ensure the final value in the model is properly escaped - the textarea
    // binds to plainTextContent (decoded) so we must re-encode before submit.
    content.value = encodeHtmlEntities(plainTextContent.value)

    // In plain-text mode the Tiptap suggestion flow never ran, so any @username
    // tokens must be resolved to @{uuid} before the content is submitted.
    content.value = await resolvePlainTextMentions(content.value, supabase)
  }

  emit('submit')
}
</script>

<template>
  <div class="vui-rich-text">
    <label v-if="props.label" class="vui-label" :for="elementId">{{ props.label }}</label>
    <p v-if="props.hint" class="vui-hint">
      {{ props.hint }}
    </p>

    <!-- Media context menu (image + video) -->
    <RichTextMediaMenu v-if="editor && props.mediaContext" :editor :bucket-id="resolvedMediaBucketId" :media-context="props.mediaContext" />

    <!-- Table context menu (add/remove rows & columns) -->
    <EditorTableMenu v-if="editor && editorMode === 'rich'" :editor />

    <!-- Main editor instance -->
    <div class="relative">
      <!-- Content agreement -->
      <div v-if="shouldShowContentRulesOverlay" class="editor-overlay">
        <p>{{ props.contentRulesOverlayText || 'Before being able to add content, you must agree our content rules' }}</p>
        <Button size="s" variant="accent" @click="contentRulesModalOpen = true">
          Acknowledge
        </Button>
      </div>

      <ContentRulesModal
        v-model:open="contentRulesModalOpen"
        :show-agree-button="shouldShowContentRulesOverlay"
        @confirm="handleContentRulesConfirmed"
      />

      <!-- Math insert / edit modal -->
      <EditorMathModal
        v-model:open="mathModalOpen"
        :initial-latex="mathModalLatex"
        :type="mathModalEditPos != null ? mathModalType : undefined"
        :edit-pos="mathModalEditPos"
        @confirm="handleMathConfirm"
      />

      <!-- YouTube embed modal -->
      <EditorYoutubeModal
        v-model:open="youtubeModalOpen"
        @confirm="handleYoutubeConfirm"
      />

      <!-- Video insert modal -->
      <EditorVideoModal
        v-model:open="videoModalOpen"
        @confirm="handleVideoConfirm"
      />

      <!-- Editor content & controls -->
      <div class="editor-container" :class="{ 'is-plain': editorMode === 'plain' }">
        <!-- Toolbar: floating bubble in rich mode, static bar in plain mode -->
        <RichTextSelectionMenu v-if="editor" :editor :plain-text="editorMode === 'plain'" :textarea-el="editorMode === 'plain' ? plainTextarea ?? null : null" />

        <div v-if="editorMode === 'rich'" class="editor-rich-wrapper">
          <span v-if="editorIsEmpty && props.placeholder" class="editor-placeholder">{{ props.placeholder }}</span>
          <EditorContent :id="elementId" :editor="editor" class="typeset" @keydown.enter.stop />
        </div>
        <textarea
          v-else
          ref="plain-textarea"
          class="plain-textarea"
          :rows="1"
          :style="plainTextStartHeight ? { height: plainTextStartHeight } : undefined"
          :value="plainTextContent"
          :placeholder="placeholder"
          @input="handlePlainTextInput(($event.target as HTMLTextAreaElement).value)"
          @keydown.ctrl.enter="handleSubmit"
          @keydown.meta.enter="handleSubmit"
        />

        <div class="editor-actions">
          <template v-if="props.showAttachmentButton">
            <Dropdown>
              <template #trigger="{ toggle }">
                <Button plain square size="s" @click="toggle">
                  <Icon name="ph:plus-square" />
                </Button>
              </template>
              <DropdownItem @click="fileInput?.click()">
                <template #icon>
                  <Icon :size="18" name="ph:paperclip" />
                </template>
                Attach a file
              </DropdownItem>
              <DropdownItem @click="youtubeModalOpen = true">
                <template #icon>
                  <Icon :size="18" name="ph:youtube-logo" />
                </template>
                Embed YouTube video
              </DropdownItem>
              <DropdownItem @click="videoModalOpen = true">
                <template #icon>
                  <Icon :size="18" name="ph:video" />
                </template>
                Insert video
              </DropdownItem>
              <DropdownItem @click="mathModalEditPos = null; mathModalType = 'inline'; mathModalLatex = ''; mathModalOpen = true">
                <template #icon>
                  <Icon :size="18" name="ph:sigma" />
                </template>
                Insert math
              </DropdownItem>
              <DropdownItem v-if="editorMode === 'rich'" @click="handleInsertTable">
                <template #icon>
                  <Icon :size="18" name="ph:table" />
                </template>
                Insert table
              </DropdownItem>
            </Dropdown>

            <input ref="file-input" class="visually-hidden" type="file" :accept="allowedMediaExtensions" @input="handleFileInput">
          </template>

          <Tooltip>
            <Button plain square size="s" @click="handleEditorModeSwitch">
              <Icon :name="editorMode === 'rich' ? 'ph:pen-nib' : 'ph:markdown-logo'" />
            </Button>
            <template #tooltip>
              <p>{{ editorMode === 'rich' ? 'Switch to plain text' : 'Switch to rich text' }}</p>
            </template>
          </Tooltip>

          <ButtonGroup v-if="props.showSubmitOptions" :gap="2">
            <Tooltip>
              <Button :variant="!!isNsfw ? 'danger' : 'gray'" square size="s" @click="isNsfw = !isNsfw">
                <Icon :name="isNsfw ? 'ph:eye-closed' : 'ph:eye'" />
              </Button>
              <template #tooltip>
                <p>{{ isNsfw ? 'Marked as NSFW' : 'Marked as safe' }}</p>
              </template>
            </Tooltip>

            <Button size="s" type="submit" @click="handleSubmit">
              Send
              <template #end>
                <Icon name="ph:paper-plane-tilt" />
              </template>
            </Button>
          </ButtonGroup>
        </div>
      </div>
    </div>

    <!-- Limit & errors -->
    <p v-if="limit && editor" class="vui-hint" style="margin-top: var(--space-xxs)">
      {{ `${editor.storage.characterCount.characters()} / ${limit}` }}
    </p>

    <ul v-if="errors.length > 0" class="vui-input-errors">
      <li v-for="err in errors" :key="err">
        {{ err }}
      </li>
    </ul>
  </div>
</template>

<style lang="scss">
.vui-rich-text {
  display: block;
  width: 100%;
  position: relative;
  z-index: 1;

  // FIXME: textarea and rich text editor cannot share the same min-height. Textare needs to be slightly smaller
  // and rich text editor needs to be slightly taller (so they meet in the middle) Due to the bubble menu being
  // always in the view. Switching between rich text & plain text must not cause a layout shift

  .editor-textarea .vui-input textarea,
  .plain-textarea {
    padding: 0 !important;
    height: v-bind(minHeight);
    min-height: v-bind(minHeight);
    border: none !important;
    border-radius: 0 !important;
    background-color: transparent !important;
    outline: none !important;
    margin: 0 !important;
    line-height: var(--line-height-base) !important;
  }

  .plain-textarea {
    display: block;
    width: 100%;
    resize: vertical;
    font-family: inherit;
    font-size: var(--font-size-m);
    color: var(--color-text);
    // Textarea always removes a bit of its min-height so that floating menu does not cause layout shift
    min-height: v-bind(minHeightPlain) !important;
    height: unset;
  }

  .editor-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: var(--space-s);
    z-index: 100;
    border-radius: var(--border-radius-m);
    backdrop-filter: blur(7px);
  }

  .editor-container {
    background-color: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-m);
    padding: var(--space-s);
    z-index: 1;
    display: flex;
    flex-direction: column;
    max-height: v-bind(maxHeight);

    &:has(.ProseMirror-focused) {
      border-color: var(--color-border-strong);
    }

    .ProseMirror {
      min-height: v-bind(minHeight);

      &.ProseMirror-focused {
        outline: none;
      }

      & > :first-child {
        margin-top: 0 !important;
      }

      // Task list (checklist) styles
      ul[data-type='taskList'] {
        list-style: none;
        padding-left: var(--space-xs);

        // Use plain li to avoid any data-type attribute resolution issues
        // on the node-view-created element.
        li {
          display: flex !important;
          align-items: flex-start;
          gap: var(--space-xs);
          padding-left: 0;
          margin-bottom: var(--space-xs);

          &:last-of-type {
            margin-bottom: 0 !important;
          }

          &:before {
            display: none !important;
          }

          // The label wraps the checkbox and is marked contenteditable=false
          > label {
            display: flex;
            align-items: center;
            flex: 0 0 auto;
            margin-top: 3px;
            cursor: pointer;

            input[type='checkbox'] {
              cursor: pointer;
              accent-color: var(--color-accent);
              width: 16px;
              height: 16px;
              margin: 0;
            }
          }

          // The div is the contentDOM – it holds the paragraph text
          > div {
            flex: 1 1 auto;
            min-width: 0;

            p {
              margin: 0;
            }

            ul {
              // margin-block: 0 !important;
              margin-bottom: 0 !important;
            }
          }

          // Checked state: strike through the text content
          &[data-checked='true'] > div > p {
            color: var(--color-text-lighter);
            // text-decoration: line-through;
          }
        }
      }

      // The VUI CSS reset includes a global rule `span, strong, p { font-size: var(--font-size-m) }`
      // which overrides the inherited font-size from heading elements (h1–h4) whenever an inline
      // mark (textFont span, bold strong, italic em, etc.) is applied inside a heading.
      // We override that here so inline marks inside headings always inherit the heading's
      // own font-size rather than being reset to the paragraph default.
      h1,
      h2,
      h3,
      h4,
      h5,
      h6 {
        span,
        strong,
        em,
        b,
        i,
        a,
        code {
          font-size: inherit;
        }
      }
    }

    // Image grouping for consecutive images in the editor.
    // The ImageGroup ProseMirror plugin decorates each image in a run with
    // data-img-run-index (0-based position) and data-img-run-total (row size).
    // CSS uses those attributes to lay images out as inline-block rows.
    // Gap between items is 8px. Width calc subtracts the gap share per item.

    // Base styles for any grouped image.
    .ProseMirror > img[data-img-run-total] {
      display: inline-block;
      vertical-align: top;
      max-height: 240px;
      max-width: none;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      border-radius: var(--border-radius-s);
      margin-bottom: var(--space-xs);
    }

    // Run of 2: each image gets ~50% minus half the gap.
    .ProseMirror > img[data-img-run-total='2'] {
      width: calc(50% - 4px);
    }

    .ProseMirror > img[data-img-run-total='2'][data-img-run-index='0'] {
      margin-right: 8px;
    }

    // Run of 3: each image gets ~33% minus a third of the total gap.
    .ProseMirror > img[data-img-run-total='3'] {
      width: calc(33.333% - 6px);
    }

    .ProseMirror > img[data-img-run-total='3'][data-img-run-index='0'],
    .ProseMirror > img[data-img-run-total='3'][data-img-run-index='1'] {
      margin-right: 8px;
    }

    .editor-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-xs);
    }
  }

  // Vue-rendered placeholder (replaces the ProseMirror decoration approach
  // which suffers from a timing issue on initial mount where
  // `this.editor.isEmpty` can resolve incorrectly before the view is wired up).
  .editor-rich-wrapper {
    overflow-y: auto;
    flex: 1 1 auto;
    min-height: 0;
    position: relative;
  }

  .editor-placeholder {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    color: var(--color-text-lighter);
    font-family: var(--font);
    line-height: var(--line-height-base);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  hr.ProseMirror-selectednode {
    border-color: var(--color-border-strong);
  }

  img.ProseMirror-selectednode {
    outline: 2px solid var(--color-text);
  }

  // Uploading placeholder states.
  // Images show a shimmer over the local preview; videos show a spinner
  // overlay since the video element itself renders black while loading.
  // Both states are keyed off blob: URLs - once the real Supabase URL is
  // swapped in the styles disappear automatically.
  @keyframes upload-shimmer {
    0% {
      opacity: 0.55;
    }
    50% {
      opacity: 0.25;
    }
    100% {
      opacity: 0.55;
    }
  }

  .ProseMirror img[src^='blob:'] {
    animation: upload-shimmer 1.4s ease-in-out infinite;
    border-radius: var(--border-radius-s);
  }

  .ProseMirror div[data-video-embed]:has(video[src^='blob:']) {
    position: relative;

    &::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: var(--border-radius-s);
      background-color: var(--color-bg-raised);
      animation: upload-shimmer 1.4s ease-in-out infinite;
    }
  }

  // Math nodes (rendered by KaTeX via @tiptap/extension-mathematics)
  .tiptap-mathematics-render {
    cursor: pointer;
    padding: 0 2px;
    border-radius: var(--border-radius-xs);
    transition: background-color var(--transition-fast);

    &:hover {
      background-color: color-mix(in srgb, var(--color-accent) 12%, transparent);
    }

    &[data-type='block-math'] {
      display: block;
      text-align: center;
      padding: var(--space-xs) 0;
      overflow-x: auto;
    }
  }

  // YouTube embeds
  .ProseMirror div[data-youtube-video] {
    display: flex;
    justify-content: center;
    margin: var(--space-s) 0;

    iframe {
      max-width: 100%;
      border-radius: var(--border-radius-s);
    }

    &.ProseMirror-selectednode iframe {
      outline: 2px solid var(--color-accent);
    }
  }

  // Video embeds (:::video directive / uploaded videos)
  .ProseMirror div[data-video-embed] {
    display: flex;
    justify-content: center;
    margin: var(--space-s) 0;

    video {
      max-width: 100%;
      border-radius: var(--border-radius-s);
    }

    &.ProseMirror-selectednode video {
      outline: 2px solid var(--color-accent);
    }
  }

  .mention {
    background-color: color-mix(in srgb, var(--color-bg-accent-lowered) 20%, transparent);
    border-radius: var(--border-radius-m);
    box-decoration-break: clone;
    color: var(--color-accent);
    padding: 0.4rem;
  }

  // Spoiler / collapsible blocks
  // The Details extension uses a custom node view - NOT a real <details> element.
  // Structure:
  //   div[data-type="details"](.is-open?)
  //     button          <- toggle (not in contentDOM)
  //     div             <- contentDOM wrapper
  //       summary       <- DetailsSummary editable title
  //       div[data-type="detailsContent"][hidden?]  <- body
  .ProseMirror div[data-type='details'] {
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-s);
    margin: var(--space-xs) 0;
    overflow: hidden;

    // Row: toggle button + summary side-by-side
    display: grid;
    grid-template-columns: 28px 1fr;

    // The toggle button rendered by the node view
    > button {
      grid-column: 1;
      grid-row: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: var(--color-text-lighter);
      cursor: pointer;
      padding: var(--space-xs) 0;
      transition: color var(--transition-fast);
      align-self: start;
      padding-top: calc(var(--space-xs) + 2px);

      &::before {
        content: '';
        display: inline-block;
        width: 0;
        height: 0;
        border-top: 4px solid transparent;
        border-bottom: 4px solid transparent;
        border-left: 6px solid currentColor;
        transition: transform var(--transition-fast);
      }

      &:hover {
        color: var(--color-text);
      }
    }

    &.is-open > button::before {
      transform: rotate(90deg);
    }

    // The contentDOM wrapper div (holds summary + detailsContent)
    > div {
      grid-column: 2;
      grid-row: 1;
      min-width: 0;
    }

    summary {
      display: block;
      font-weight: 600;
      color: var(--color-text);
      padding: var(--space-xs) var(--space-s) var(--space-xs) 0;
      outline: none;
      cursor: text;

      // Hide the default browser disclosure triangle
      list-style: none;
      &::-webkit-details-marker {
        display: none;
      }
    }

    // The hidden/shown content body
    div[data-type='detailsContent'] {
      padding: var(--space-xs) var(--space-s) var(--space-s) 0;
      border-top: 1px solid var(--color-border-weak);

      > * {
        &:first-child {
          margin-top: 0;
        }
        &:last-child {
          margin-bottom: 0;
        }
      }

      // Always show content while editing so users can click into it
      &[hidden] {
        display: block !important;
        opacity: 0.35;
      }
    }
  }

  // Tables
  .ProseMirror table {
    border-collapse: collapse;
    width: 100%;
    margin: var(--space-s) 0;
    table-layout: fixed;
    overflow: hidden;

    td,
    th {
      border: 1px solid var(--color-border);
      padding: var(--space-xs) var(--space-s);
      vertical-align: top;
      min-width: 40px;
      position: relative;

      > * {
        margin: 0;
      }

      p {
        margin: 0;
      }
    }

    th {
      background-color: var(--color-bg-raised);
      font-weight: 600;
      text-align: left;
    }

    .selectedCell::after {
      content: '';
      position: absolute;
      inset: 0;
      background-color: color-mix(in srgb, var(--color-accent) 10%, transparent);
      pointer-events: none;
    }

    .column-resize-handle {
      position: absolute;
      right: -2px;
      top: 0;
      bottom: 0;
      width: 4px;
      background-color: var(--color-accent);
      cursor: col-resize;
      pointer-events: all;
    }
  }

  .tableWrapper {
    overflow-x: auto;
    margin: var(--space-s) 0;
  }
}

.rich-text-floating-menu {
  background-color: var(--color-bg);
  box-shadow: var(--box-shadow-strong);
  border-radius: var(--border-radius-m);
  border: 1px solid var(--color-border);
  z-index: var(--z-popout);
}
</style>
