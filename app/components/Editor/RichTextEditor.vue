<script setup lang="ts">
import type { JSONContent } from '@tiptap/core'
import type { StorageBucketId } from '@/lib/storageAssets'
import type { Database } from '@/types/database.types'
import { Button, ButtonGroup, Dropdown, DropdownItem, Modal, pushToast, Spinner, Tooltip } from '@dolanske/vui'
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
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { marked } from 'marked'
import { computed, nextTick, ref, useId, watch } from 'vue'
import { onBeforeRouteLeave, useSupabaseClient, useSupabaseUser } from '#imports'
import ContentRulesModal from '@/components/Shared/ContentRulesModal.vue'
import { useContentRulesAgreement } from '@/composables/useContentRulesAgreement'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { replaceOutsideCode } from '@/lib/markdownProcessors'
import { useBreakpoint } from '@/lib/mediaQuery'
import { forgetPendingMedia, livePendingMedia, loadPendingMedia, rememberPendingMedia } from '@/lib/pendingMedia'
import { allowedAudioTypes, allowedDataExtensions, allowedDataTypes, allowedMediaExtensions, allowedMediaTypes, allowedVideoTypes, compressImageToFit, convertImageToWebP, stripImageMetadata } from '@/lib/storage'
import { BUCKET_SIZE_LIMITS, formatBytes, FORUMS_BUCKET_ID } from '@/lib/storageAssets'
import EditorContextMenu from './EditorContextMenu.vue'
import EditorMathModal from './EditorMathModal.vue'
import EditorTableMenu from './EditorTableMenu.vue'
import EditorVideoModal from './EditorVideoModal.vue'
import EditorYoutubeModal from './EditorYoutubeModal.vue'
import { Audio } from './plugins/audio'
import { DataFile } from './plugins/dataFile'
import { ImageGroup } from './plugins/imageGroup'
import { LinkEmbed as LinkEmbedNode } from './plugins/linkEmbed'
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

const LazyImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // Client-only id that tracks a placeholder through conversion and upload,
      // since `src` changes. Never serialized: rendered is false and markdown only emits src/alt/title.
      uploadId: {
        default: null,
        rendered: false,
      },
    }
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-img-node': '' }, ['img', { loading: 'lazy', decoding: 'async', onerror: 'this.classList.add(\'img-error\')', ...HTMLAttributes }]]
  },
})

const ENCODE_AMP_RE = /&/g
const ENCODE_LT_RE = /</g
const DECODE_GT_RE = /&gt;/g
const DECODE_LT_RE = /&lt;/g
const DECODE_AMP_RE = /&amp;/g
const INLINE_HTML_TAG_RE = /^<(?:[a-z][a-z0-9-]*(?:\s[^>]*)?\/?|\/[a-z][a-z0-9-]*\s*|!--[\s\S]*?--)>/i
const NBSP_TRAILING_RE = /^&nbsp;$/gm
const NBSP_SINGLE_RE = /&nbsp;$/
const HTML_ANGLE_RE = /<([^>]*)>/g
const TRAILING_WS_RE = /(\s+)$/
const LEADING_WS_RE = /^(\s+)/
// [url](url) where the label equals the href, collapsed to a bare url
const SELF_LINK_RE = /\[([^\]]+)\]\(\1\)/g

// Atom media nodes on the blob-placeholder upload flow: a blob src goes in
// immediately and gets swapped for the storage URL once uploaded.
const MEDIA_NODE_TYPES = new Set(['image', 'video', 'audio'])

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
  showExpandButton?: boolean
  alwaysShowExpandButton?: boolean

  fullscreenOnMobile?: boolean
  showSubmitOptions?: boolean

  /** Disables the editor and spins the send button while the parent handles async work after submit. */
  loading?: boolean
  contentRulesOverlayText?: string

  /**
   * If provided, it will enable media upload via pasting/dragging media files
   * into the editor. Providing a context helps with file management
   */
  mediaContext?: string

  /** Defaults to the forums bucket. */
  mediaBucketId?: StorageBucketId

  /** Strips EXIF and other image metadata before upload. Defaults to true. */
  stripImageMetadata?: boolean
}

const { settings } = useDataUserSettings()

const editorMode = ref <'rich' | 'plain'>('rich')
const editorIsEmpty = ref(true)
const isSubmitting = ref(false)

const content = defineModel<string>()

// ---------------------------------------------------------------------------
// Plain-text display helpers
//
// The content model stores tags escaped with &lt; so the markdown renderer
// never parses them as HTML. The textarea shows them decoded and re-escapes edits.
// ------------------------------------------------------------------------
const minHeightPlain = computed(() => {
  const cssValue = Number(minHeight.slice(0, -2))

  //                vv The height & margin of the now static menu
  return `${cssValue - 28}px`
})

// Both directions skip code spans and fenced blocks, since markdown never
// decodes entities inside code.
//
// Only "<" is escaped. That's enough to stop tag parsing, and ">" is the
// blockquote marker: escaping it would turn every quote into a plain paragraph.
function encodeHtmlEntities(str: string): string {
  return replaceOutsideCode(str, text =>
    text.replace(ENCODE_AMP_RE, '&amp;').replace(ENCODE_LT_RE, '&lt;'))
}

function decodeHtmlEntities(str: string): string {
  return replaceOutsideCode(str, text =>
    text.replace(DECODE_GT_RE, '>').replace(DECODE_LT_RE, '<').replace(DECODE_AMP_RE, '&'))
}

// Decoded `content` for the plain-text textarea
const plainTextContent = ref('')
const plainTextarea = useTemplateRef<HTMLTextAreaElement>('plain-textarea')

function resizePlainTextarea() {
  const el = plainTextarea.value
  if (!el)
    return

  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function handlePlainTextInput(value: string) {
  plainTextContent.value = value
  content.value = encodeHtmlEntities(value)
  nextTick(resizePlainTextarea)
}
const isNsfw = defineModel<boolean>('nsfw', { default: false })

const resolvedMediaBucketId = computed(() => props.mediaBucketId ?? FORUMS_BUCKET_ID)

const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()

const { agreed: fetchedContentRulesAgreement, markAgreed } = useContentRulesAgreement()

// Suppresses media cleanup while content is replaced externally. ProseMirror
// dispatches transactions synchronously, so a plain boolean is safe.
let externalContentUpdate = false

// Public URL format: {origin}/storage/v1/object/public/{bucket}/{path}
function extractStoragePath(src: string, bucketId: string): string | null {
  const marker = `/storage/v1/object/public/${bucketId}/`
  const idx = src.indexOf(marker)
  if (idx === -1)
    return null

  // Supabase may append query params
  return decodeURIComponent((src.slice(idx + marker.length).split('?').at(0)) ?? '')
}

// ---------------------------------------------------------------------------
// Math modal state (declared before useEditor so the extension onClick
// callbacks can close over these reactive refs at setup time)
// ---------------------------------------------------------------------------
const expandedOpen = ref(false)
const isMobile = useBreakpoint('<s')

const mathModalOpen = ref(false)
const mathModalLatex = ref('')
const mathModalType = ref<'inline' | 'block'>('inline')
const mathModalEditPos = ref<number | null>(null)

const youtubeModalOpen = ref(false)

const videoModalOpen = ref(false)

// Keyed on uploadId because a node's blob src can change mid-conversion, and
// a src walk that misses its node would lose the upload.
const pendingBlobs = new Map<string, { file: File, blobUrl: string }>()

// flushPendingUploads must await these before snapshotting pendingBlobs, or a
// conversion that swaps a blob src mid-upload leaves the placeholder in the doc.
const pendingConversions = new Set<Promise<void>>()

// Per-upload progress 0-100, keyed by uploadId
const uploadProgress = ref(new Map<string, number>())

const isUploading = ref(false)

// A line holding only an image. Groups: 1=alt, 2=url, 3=optional title.
const BLOCK_IMAGE_RE = /^!\[([^\]]*)\]\((\S+?)(?:\s+"([^"]*)")?\)[ \t]*(?:\n|$)/

// @tiptap/markdown runs marked's inline `html` tokens through generateJSON(),
// which drops unknown tags along with their content. This instance re-emits
// them as text so typed tags stay literal. getEditorMarkdown() escapes them on the way out.
const noHtmlMarked = marked.use({
  extensions: [
    {
      // Left alone, marked wraps a lone image in a paragraph, which puts a
      // block `image` node inside paragraph content and breaks the schema.
      name: 'image',
      level: 'block',
      start(src: string) {
        return src.indexOf('![')
      },
      tokenizer(src: string) {
        const match = BLOCK_IMAGE_RE.exec(src)
        if (match) {
          return {
            type: 'image',
            raw: match[0]!,
            text: match[1] ?? '',
            href: match[2] ?? '',
            title: match[3] ?? null,
            tokens: [],
          }
        }
      },
    },
    {
      name: 'stripInlineHtml',
      level: 'inline',
      start(src: string) {
        return src.indexOf('<')
      },
      tokenizer(src: string) {
        // Opening, closing and self-closing tags, plus comments
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
    StarterKit.configure({
      // Opening on a plain click is disruptive while editing. The context menu opens links.
      link: { openOnClick: false },
    }),
    // @tiptap/markdown vendors its own copy of marked; the two instances have
    // incompatible internal types even though their runtime API is identical.
    // eslint-disable-next-line ts/no-explicit-any
    Markdown.configure({ marked: noHtmlMarked as any }),
    LazyImage,
    ImageGroup,
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
    TextColor,
    TextFont,
    TextSize,
    TaskList,
    TaskItem.configure({ nested: true }),
    // User mentions
    createMentionExtension(supabase),

    // Not @tiptap/extension-file-handler: it returns false when the clipboard
    // also has text/html, so ProseMirror's default paste then inserts a raw image link.
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

                    // Screenshots and images copied from other apps can leave
                    // .files empty and only show up in .items.
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
    Youtube.configure({
      nocookie: true,
      width: 640,
      height: 360,
      allowFullscreen: true,
    }),
    Video,
    Audio,
    LinkEmbedNode,
    DataFile,
    Details.configure({ persist: true }),
    DetailsSummary,
    DetailsContent,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    // Cosmetic only. Stored markdown keeps #channel mentions as plain text.
    Extension.create({
      name: 'channelMentionDecoration',
      addProseMirrorPlugins() {
        const CHANNEL_RE = /(?<![`\w#])#[a-z][\w-]*/gi
        return [
          new Plugin({
            key: new PluginKey('channelMentionDecoration'),
            props: {
              decorations(state) {
                const decorations: Decoration[] = []
                state.doc.descendants((node, pos) => {
                  if (!node.isText || !node.text)
                    return

                  CHANNEL_RE.lastIndex = 0
                  let match: RegExpExecArray | null

                  // eslint-disable-next-line no-cond-assign
                  while ((match = CHANNEL_RE.exec(node.text)) !== null) {
                    const from = pos + match.index
                    const to = from + match[0].length
                    decorations.push(Decoration.inline(from, to, { class: 'channel-mention' }))
                  }
                })
                return DecorationSet.create(state.doc, decorations)
              },
            },
          }),
        ]
      },
    }),
  ],
  contentType: 'markdown',
  onCreate: () => {
    // Upstream only compares mark types at boundaries, so adjacent red and orange
    // textColor merge into :::color[red]Testing::: instead of
    // :::color[red]Test::::::color[orange]ing:::. The helpers it calls can't be
    // swapped individually, so the instance method gets patched to compare attrs.
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
        // Fast path: no adjacent pair has same-type marks with different attrs
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

            const toClose: string[] = []
            for (const [type, activeMark] of activeMarks) {
              const cur = currentMarks.get(type)
              if (!cur || !marksEqual(activeMark, cur))
                toClose.push(type)
            }

            const toOpen: Array<{ type: string, mark: MarkEntry }> = []
            for (const [type, mark] of currentMarks) {
              const active = activeMarks.get(type)
              if (!active || !marksEqual(active, mark))
                toOpen.push({ type, mark })
            }

            // Close in reverse order for proper nesting
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

    // Wait a tick so EditorContent has attached the view to the DOM
    nextTick(() => {
      editorIsEmpty.value = editor.value?.isEmpty ?? true
    })
  },
  onUpdate: () => {
    editorIsEmpty.value = editor.value?.isEmpty ?? true

    // getEditorMarkdown() keeps the empty-paragraph "&nbsp;" sentinel out of the model
    content.value = getEditorMarkdown()
  },
  onTransaction: ({ transaction }) => {
    if (!transaction.docChanged || !props.mediaContext || externalContentUpdate)
      return

    const prevNodes = new Map<string, string | null>()
    transaction.before.descendants((node) => {
      if (MEDIA_NODE_TYPES.has(node.type.name) && typeof node.attrs.src === 'string')
        prevNodes.set(node.attrs.src, typeof node.attrs.uploadId === 'string' ? node.attrs.uploadId : null)
    })

    if (prevNodes.size === 0)
      return

    const nextSrcs = new Set<string>()
    transaction.doc.descendants((node) => {
      if (MEDIA_NODE_TYPES.has(node.type.name) && typeof node.attrs.src === 'string')
        nextSrcs.add(node.attrs.src)
    })

    // Media removed from the doc gets removed from storage
    for (const [src, uploadId] of prevNodes) {
      if (nextSrcs.has(src))
        continue

      if (src.startsWith('blob:')) {
        URL.revokeObjectURL(src)
        forgetPendingMedia(src)
        if (uploadId !== null) {
          pendingBlobs.delete(uploadId)
          uploadProgress.value.delete(uploadId)
          uploadProgress.value = new Map(uploadProgress.value)
        }
        continue
      }

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

function getEditorMarkdown(): string {
  if (!editor.value || editor.value.isEmpty)
    return ''

  const raw = editor.value.getMarkdown() ?? ''

  // @tiptap/extension-paragraph serialises every empty paragraph as "&nbsp;"
  // so it survives a round trip. That sentinel must never reach the content model.
  const stripped = raw
    .replace(NBSP_TRAILING_RE, '')
    .replace(NBSP_SINGLE_RE, '')

    // Bare URLs let the markdown renderer promote standalone internal links to embeds
    .replace(SELF_LINK_RE, '$1')

  // Tiptap holds typed tags as raw text, so escape them for the renderer. Code
  // is left alone because the renderer shows it verbatim.
  const escaped = replaceOutsideCode(stripped, text => text.replace(HTML_ANGLE_RE, '&lt;$1&gt;'))

  return escaped.trim() === '' ? '' : escaped
}

const hasPendingUploads = computed(() => pendingBlobs.size > 0)
const avgUploadProgress = computed(() => {
  const vals = [...uploadProgress.value.values()]
  if (vals.length === 0)
    return 0

  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
})

// Runs after the placeholder is in so the preview shows immediately, then
// swaps the placeholder's blob src to the optimised bytes.
async function processPendingFile(originalFile: File, uploadId: string, currentBlobUrl: string, skipImageProcessing: boolean) {
  // WebP conversion ignores the metadata-stripping preference. GIF is skipped
  // because the canvas round trip drops animation.
  const shouldConvert = !skipImageProcessing
    && originalFile.type !== 'image/gif'
    && originalFile.type !== 'image/webp'

  const shouldStrip = !skipImageProcessing
    && !shouldConvert
    && originalFile.type !== 'image/webp'
    && props.stripImageMetadata !== false
    && settings.value.strip_image_metadata !== false

  let file: File
  if (shouldConvert) {
    try {
      file = await convertImageToWebP(originalFile, 0.85)
    }
    catch {
      pushToast('Image conversion failed', {
        description: 'Could not convert to WebP - uploading original format.',
      })
      file = originalFile
    }
  }
  else if (shouldStrip) {
    file = await stripImageMetadata(originalFile)
  }
  else {
    file = originalFile
  }

  const sizeLimit = BUCKET_SIZE_LIMITS[resolvedMediaBucketId.value]
  if (!skipImageProcessing && file.type !== 'image/gif' && file.size > sizeLimit) {
    try {
      const compressed = await compressImageToFit(file, sizeLimit)
      if (compressed.size < file.size)
        file = compressed

      if (file.size > sizeLimit) {
        pushToast('Image still exceeds upload limit', {
          description: `Compressed to ${formatBytes(file.size)}, limit is ${formatBytes(sizeLimit)}. Upload may fail.`,
        })
      }
    }
    catch {
      pushToast('Image compression failed', {
        description: 'Uploading original - it may exceed the size limit.',
      })
    }
  }

  if (file === originalFile)
    return

  // The placeholder may have been deleted while converting
  const newBlobUrl = URL.createObjectURL(file)
  let swapped = false
  if (editor.value) {
    editor.value.state.doc.descendants((node, nodePos) => {
      if (swapped)
        return false

      const isMedia = MEDIA_NODE_TYPES.has(node.type.name)
      if (isMedia && node.attrs.uploadId === uploadId) {
        editor.value!
          .chain()
          .command(({ tr }) => {
            tr.setNodeAttribute(nodePos, 'src', newBlobUrl)
            return true
          })
          .run()
        swapped = true
        return false
      }
    })
  }

  if (swapped) {
    pendingBlobs.set(uploadId, { file, blobUrl: newBlobUrl })
    rememberPendingMedia(newBlobUrl, file)
  }
  else {
    URL.revokeObjectURL(newBlobUrl)
    pendingBlobs.delete(uploadId)
    uploadProgress.value.delete(uploadId)
    uploadProgress.value = new Map(uploadProgress.value)
  }
  URL.revokeObjectURL(currentBlobUrl)
  forgetPendingMedia(currentBlobUrl)
}

function handleFileUpload(files: File[] | null, pos?: number) {
  if (!files || files.length === 0)
    return

  // Placeholders go in synchronously from the original files, so the preview
  // shows before conversion finishes (seconds on mobile). Inserting them async
  // scrambles the order of a multi-image drop and stacks them on one position.
  let nextPos = pos ?? editor.value?.state.selection.anchor ?? 0
  const queue: Array<{ originalFile: File, uploadId: string, blobUrl: string, skipImageProcessing: boolean }> = []

  for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
    const originalFile = files[fileIndex]!
    const isLast = fileIndex === files.length - 1

    if (!editor.value)
      return

    const isVideo = allowedVideoTypes.includes(originalFile.type)
    const isAudio = allowedAudioTypes.includes(originalFile.type)
    const nodeType = isVideo ? 'video' : isAudio ? 'audio' : 'image'

    const skipImageProcessing = isVideo || isAudio

    const blobUrl = URL.createObjectURL(originalFile)

    const uploadId = crypto.randomUUID()

    // No selection, so the bubble menu stays closed mid-upload. Only the last
    // insert focuses, to avoid soft-keyboard flicker on mobile.
    const chain = editor.value
      .chain()
      .insertContentAt(nextPos, {
        type: nodeType,
        attrs: { src: blobUrl, uploadId },
      }, { updateSelection: false })

    if (isLast)
      chain.focus().run()
    else
      chain.run()

    // Media atoms have nodeSize 1
    nextPos += 1

    // Registering now gates the submit button through hasPendingUploads
    pendingBlobs.set(uploadId, { file: originalFile, blobUrl })
    rememberPendingMedia(blobUrl, originalFile)
    uploadProgress.value.set(uploadId, 0)

    queue.push({ originalFile, uploadId, blobUrl, skipImageProcessing })
  }

  uploadProgress.value = new Map(uploadProgress.value)

  for (const item of queue) {
    const conversion = processPendingFile(item.originalFile, item.uploadId, item.blobUrl, item.skipImageProcessing)
      .finally(() => pendingConversions.delete(conversion))
    pendingConversions.add(conversion)
  }
}

// Converts the FileList from @input event into a File[]

// file.type.split('/')[1] is wrong for image/svg+xml and video/quicktime, and
// undefined for an empty type.
const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'oga',
  'audio/flac': 'flac',
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/webm': 'weba',
  'audio/opus': 'opus',
}

function extensionForMime(mime: string): string {
  return MIME_EXTENSION_MAP[mime] ?? 'bin'
}

// Upload retry/timeout tuning for flaky mobile networks.
const UPLOAD_MAX_ATTEMPTS = 3
const UPLOAD_TIMEOUT_MS = 30_000
const UPLOAD_RETRY_BACKOFF_MS = 1_000

async function flushPendingUploads(): Promise<boolean> {
  if (pendingConversions.size > 0)
    await Promise.allSettled([...pendingConversions])

  if (pendingBlobs.size === 0)
    return true

  isUploading.value = true

  // pointer-events: none only blocks the mouse. A focused ProseMirror still takes
  // keys, and an edit mid-upload could swap a blob src out before the final swap.
  const editorRef = editor.value
  const wasEditable = editorRef?.isEditable ?? true
  editorRef?.setEditable(false)

  try {
    const entries = [...pendingBlobs.entries()]

    // Upload in parallel without touching the doc. A stalled mobile request
    // times out and retries instead of hanging.
    const results = await Promise.all(
      entries.map(async ([uploadId, { file, blobUrl }]) => {
        const format = extensionForMime(file.type)

        let lastError: { message: string } | null = null
        let fileUrl = ''
        for (let attempt = 0; attempt < UPLOAD_MAX_ATTEMPTS; attempt++) {
          // Fresh path per attempt: a timed-out attempt can still succeed
          // server-side, and a same-path retry would 409. The orphan is harmless.
          fileUrl = `${props.mediaContext}/${crypto.randomUUID()}.${format}`

          // storage-js upload() does not accept an abort signal, so race it
          // against a timeout to bound a stalled request.
          let timeoutId: ReturnType<typeof setTimeout> | undefined
          try {
            const { error } = await Promise.race([
              supabase.storage
                .from(resolvedMediaBucketId.value)
                .upload(fileUrl, file, { contentType: file.type, metadata: { uploadedBy: user.value?.id ?? 'anonymous' } }),
              new Promise<{ error: { message: string } }>((resolve) => {
                timeoutId = setTimeout(
                  resolve,
                  UPLOAD_TIMEOUT_MS,
                  { error: { message: `Upload timed out after ${UPLOAD_TIMEOUT_MS / 1000}s` } },
                )
              }),
            ])

            if (!error) {
              lastError = null
              break
            }
            lastError = error
          }
          catch (err) {
            lastError = { message: err instanceof Error ? err.message : String(err) }
          }
          finally {
            if (timeoutId !== undefined)
              clearTimeout(timeoutId)
          }

          if (attempt < UPLOAD_MAX_ATTEMPTS - 1)
            await new Promise(resolve => setTimeout(resolve, UPLOAD_RETRY_BACKOFF_MS * (attempt + 1)))
        }

        if (lastError) {
          const limit = BUCKET_SIZE_LIMITS[resolvedMediaBucketId.value]
          pushToast('Error uploading media', {
            description: `${lastError.message} (file is ${formatBytes(file.size)}, limit is ${formatBytes(limit)})`,
          })
          return { uploadId, blobUrl, publicUrl: null as string | null }
        }

        // No onUploadProgress in this storage-js version
        uploadProgress.value.set(uploadId, 100)
        uploadProgress.value = new Map(uploadProgress.value)

        const { data } = supabase.storage.from(resolvedMediaBucketId.value).getPublicUrl(fileUrl)
        return { uploadId, blobUrl, publicUrl: data.publicUrl }
      }),
    )

    // Swap every uploaded placeholder in one transaction once the network is done
    const urlMap = new Map(
      results
        .filter((r): r is { uploadId: string, blobUrl: string, publicUrl: string } => r.publicUrl !== null)
        .map(r => [r.uploadId, r.publicUrl]),
    )
    if (editorRef && urlMap.size > 0) {
      editorRef
        .chain()
        .command(({ tr }) => {
          tr.doc.descendants((node, nodePos) => {
            const isMedia = MEDIA_NODE_TYPES.has(node.type.name)
            if (isMedia && typeof node.attrs.uploadId === 'string') {
              const publicUrl = urlMap.get(node.attrs.uploadId)
              if (publicUrl) {
                tr.setNodeAttribute(nodePos, 'src', publicUrl)

                tr.setNodeAttribute(nodePos, 'uploadId', null)
              }
            }
          })
          return true
        })
        .run()
    }

    // Failed entries stay in pendingBlobs so the next submit retries them
    for (const r of results) {
      if (r.publicUrl !== null) {
        URL.revokeObjectURL(r.blobUrl)
        forgetPendingMedia(r.blobUrl)
        pendingBlobs.delete(r.uploadId)
        uploadProgress.value.delete(r.uploadId)
      }
    }
    uploadProgress.value = new Map(uploadProgress.value)

    if (!results.every(r => r.publicUrl !== null))
      return false

    // Fail closed: any media still on a blob: URL would ship as a broken image,
    // even when every upload reported success.
    let hasBlobRemaining = false
    editorRef?.state.doc.descendants((node) => {
      if (hasBlobRemaining)
        return false

      const isMedia = MEDIA_NODE_TYPES.has(node.type.name)
      if (isMedia && typeof node.attrs.src === 'string' && node.attrs.src.startsWith('blob:')) {
        hasBlobRemaining = true
        return false
      }
    })

    if (hasBlobRemaining) {
      pushToast('Some media failed to upload', {
        description: 'One or more images, videos or audio files are still uploading. Please try again.',
      })
      return false
    }

    return true
  }
  finally {
    if (wasEditable)
      editorRef?.setEditable(true)
    isUploading.value = false
  }
}

function handleReplacePendingBlob(oldBlobUrl: string, newFile: File) {
  if (!editor.value)
    return

  const newBlobUrl = URL.createObjectURL(newFile)

  let uploadId: string | null = null
  editor.value.state.doc.descendants((node, nodePos) => {
    if (uploadId !== null)
      return false

    if (node.type.name === 'image' && node.attrs.src === oldBlobUrl) {
      uploadId = typeof node.attrs.uploadId === 'string' ? node.attrs.uploadId : null
      editor.value!
        .chain()
        .setNodeSelection(nodePos)
        .updateAttributes('image', { src: newBlobUrl })
        .focus()
        .run()
      return false
    }
  })

  if (uploadId !== null) {
    pendingBlobs.set(uploadId, { file: newFile, blobUrl: newBlobUrl })
    rememberPendingMedia(newBlobUrl, newFile)
    uploadProgress.value.set(uploadId, 0)
    uploadProgress.value = new Map(uploadProgress.value)
  }
  URL.revokeObjectURL(oldBlobUrl)
  forgetPendingMedia(oldBlobUrl)
}

interface AdoptedMedia {
  uploadId: string
  file: File
  blobUrl: string
}

// Find the file behind a blob src this instance isn't tracking. A URL still
// alive on this page keeps its src. One from an earlier page load is dead, so
// the same bytes get a fresh URL.
async function resolveOrphanMedia(src: string): Promise<AdoptedMedia | null> {
  for (const [uploadId, entry] of pendingBlobs) {
    if (entry.blobUrl === src)
      return { uploadId, ...entry }
  }

  const liveFile = livePendingMedia(src)
  if (liveFile)
    return { uploadId: crypto.randomUUID(), file: liveFile, blobUrl: src }

  const storedFile = await loadPendingMedia(src)
  if (storedFile)
    return { uploadId: crypto.randomUUID(), file: storedFile, blobUrl: URL.createObjectURL(storedFile) }

  return null
}

// Content from outside the editor (a restored draft, the fullscreen editor, a
// plain-text round trip) can carry blob: media this instance never registered.
// Link each back to its file so it uploads on submit. Media whose file is gone gets removed.
async function adoptOrphanMedia() {
  if (!editor.value || !props.mediaContext)
    return

  const blobSrcs = new Set<string>()
  const orphans = new Set<string>()
  editor.value.state.doc.descendants((node) => {
    const { src, uploadId } = node.attrs
    if (!MEDIA_NODE_TYPES.has(node.type.name) || typeof src !== 'string' || !src.startsWith('blob:'))
      return

    blobSrcs.add(src)
    if (typeof uploadId !== 'string' || !pendingBlobs.has(uploadId))
      orphans.add(src)
  })

  // Pending entries whose media left the doc through the content model (a
  // reset, or the fullscreen editor uploading or deleting it) would otherwise
  // hold the submit gate and upload a file nobody references.
  for (const [uploadId, { blobUrl }] of pendingBlobs) {
    if (blobSrcs.has(blobUrl))
      continue

    URL.revokeObjectURL(blobUrl)
    forgetPendingMedia(blobUrl)
    pendingBlobs.delete(uploadId)
    uploadProgress.value.delete(uploadId)
  }

  if (orphans.size === 0) {
    uploadProgress.value = new Map(uploadProgress.value)
    return
  }

  const resolved = new Map(await Promise.all([...orphans].map(async src => [src, await resolveOrphanMedia(src)] as const)))

  // Stamp or swap every matching node in one transaction, deleting back to
  // front so earlier positions stay valid. Kept out of undo history so undo
  // can't bring a dead src back.
  const applied = new Set<string>()
  let dropped = false

  editor.value
    ?.chain()
    .command(({ tr }) => {
      const targets: Array<{ pos: number, size: number, src: string }> = []
      tr.doc.descendants((node, pos) => {
        const src = node.attrs.src
        if (MEDIA_NODE_TYPES.has(node.type.name) && typeof src === 'string' && resolved.has(src))
          targets.push({ pos, size: node.nodeSize, src })
      })

      for (const { pos, size, src } of targets.toReversed()) {
        const media = resolved.get(src)
        if (media == null) {
          tr.delete(pos, pos + size)
          dropped = true
          continue
        }

        tr.setNodeAttribute(pos, 'src', media.blobUrl)
        tr.setNodeAttribute(pos, 'uploadId', media.uploadId)
        applied.add(src)
      }

      tr.setMeta('addToHistory', false)
      return true
    })
    .run()

  // Register what landed. A result with no node left to land on (the user
  // deleted it, or a concurrent pass already adopted it) only frees its URL.
  for (const [src, media] of resolved) {
    if (media == null)
      continue

    if (!applied.has(src)) {
      if (media.blobUrl !== src)
        URL.revokeObjectURL(media.blobUrl)

      continue
    }

    pendingBlobs.set(media.uploadId, { file: media.file, blobUrl: media.blobUrl })
    if (!uploadProgress.value.has(media.uploadId))
      uploadProgress.value.set(media.uploadId, 0)

    if (media.blobUrl !== src) {
      rememberPendingMedia(media.blobUrl, media.file)
      forgetPendingMedia(src)
    }
  }

  uploadProgress.value = new Map(uploadProgress.value)

  if (dropped) {
    pushToast('Some media is no longer available', {
      description: 'An attachment in your draft couldn\'t be restored and was removed.',
    })
  }
}

const fileInput = useTemplateRef('file-input')

const DATA_FILE_EXT_RE = /\.(?:csv|json|zip|7z|rar|tar|gz|tgz)$/i

// Browsers leave file.type empty for most archives, so contentType comes from the extension
const ARCHIVE_EXT_TO_MIME: Record<string, string> = {
  'zip': 'application/zip',
  '7z': 'application/x-7z-compressed',
  'rar': 'application/vnd.rar',
  'tar': 'application/x-tar',
  'gz': 'application/gzip',
  'tgz': 'application/gzip',
}

// No blob placeholder here. The upload is fast and a data file has no preview anyway.
async function handleDataFileUpload(file: File) {
  if (!editor.value || !props.mediaContext)
    return

  // Captured before any await. A concurrent image placeholder can leave a
  // NodeSelection on itself, and insertContent() would then replace the image.
  const insertPos = editor.value.state.selection.anchor

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'csv'
  const type: 'csv' | 'json' | 'archive' = ext === 'json'
    ? 'json'
    : ARCHIVE_EXT_TO_MIME[ext]
      ? 'archive'
      : 'csv'
  const fileUrl = `${props.mediaContext}/${crypto.randomUUID()}.${ext}`

  // The bucket's allow-list needs a concrete type
  const contentType = ARCHIVE_EXT_TO_MIME[ext] ?? (file.type || 'application/octet-stream')

  const { error } = await supabase.storage
    .from(resolvedMediaBucketId.value)
    .upload(fileUrl, file, { contentType, metadata: { uploadedBy: user.value?.id ?? 'anonymous' } })

  if (error) {
    pushToast('Error uploading file', { description: error.message })
    return
  }

  const { data } = supabase.storage.from(resolvedMediaBucketId.value).getPublicUrl(fileUrl)

  editor.value
    .chain()
    .insertContentAt(insertPos, {
      type: 'dataFile',
      attrs: { src: data.publicUrl, name: file.name, type },
    }, { updateSelection: false })
    .focus()
    .run()
}

function handleCombinedFileInput(event: Event) {
  const files = (event.target as HTMLInputElement).files
  if (files == null || files.length === 0)
    return

  const mediaFiles: File[] = []

  for (const file of files) {
    if (allowedMediaTypes.includes(file.type)) {
      mediaFiles.push(file)
    }
    else if (allowedDataTypes.includes(file.type) || DATA_FILE_EXT_RE.test(file.name)) {
      void handleDataFileUpload(file)
    }
    else {
      pushToast('Unsupported file type', { description: `${file.name} is not a supported file type.` })
    }
  }

  if (mediaFiles.length > 0)
    handleFileUpload(mediaFiles)

  // Reset so the same files can be picked again
  ;(event.target as HTMLInputElement).value = ''
}

function handleMathConfirm(payload: { latex: string, type: 'inline' | 'block', editPos: number | null }) {
  if (!editor.value)
    return

  if (payload.editPos != null) {
    if (payload.type === 'inline') {
      editor.value.chain().setNodeSelection(payload.editPos).updateInlineMath({ latex: payload.latex }).focus().run()
    }
    else {
      editor.value.chain().setNodeSelection(payload.editPos).updateBlockMath({ latex: payload.latex }).focus().run()
    }
  }
  else {
    if (payload.type === 'inline') {
      editor.value.commands.insertInlineMath({ latex: payload.latex })
    }
    else {
      editor.value.commands.insertBlockMath({ latex: payload.latex })
    }
  }
}

function handleYoutubeConfirm(url: string) {
  if (!editor.value || !url.trim())
    return

  editor.value.commands.setYoutubeVideo({ src: url.trim() })
}

function handleInsertTable() {
  editor.value?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
}

function handleVideoConfirm(url: string) {
  if (!editor.value || !url.trim())
    return

  editor.value.commands.insertVideo({ src: url.trim() })
}

watch(
  [isMobile, () => props.fullscreenOnMobile],
  ([mobile, fullscreenProp]) => {
    if (mobile && fullscreenProp)
      expandedOpen.value = true
  },
  { immediate: true },
)

// If content is changed externally, make sure mentions are hydrated
watch(() => editor.value, (value) => {
  if (value) {
    hydrateMentionLabels(value, supabase, content.value ?? '')
    void adoptOrphanMedia()
  }
}, { immediate: true })

// Update editor content manually on model change
watch(content, async (newContent) => {
  // The expanded modal owns focus. Syncing this background editor on every
  // keystroke reflows and makes the view jump. The expandedOpen watcher resyncs on close.
  if (expandedOpen.value)
    return

  // In plain-text mode the textarea owns the content. Forwarding to Tiptap would
  // fire onUpdate, and getEditorMarkdown() would write a mangled value back.
  if (editorMode.value === 'plain') {
    const decoded = decodeHtmlEntities(newContent ?? '')
    if (plainTextContent.value !== decoded) {
      plainTextContent.value = decoded
    }
    return
  }

  // Compare normalised markdown so an empty editor's raw "&nbsp;" doesn't
  // trigger a setContent that writes it back into the model.
  const currentMarkdown = getEditorMarkdown()
  if (currentMarkdown === (newContent ?? '')) {
    return
  }

  // setContent before the view is attached throws a RangeError. If it's still
  // detached after a tick, the editor already has this content from its initial prop.
  if (!editor.value?.view?.dom?.isConnected) {
    await nextTick()
    if (!editor.value?.view?.dom?.isConnected)
      return
  }

  externalContentUpdate = true
  editor.value?.commands.setContent(newContent ?? '', {
    contentType: 'markdown',
  })
  externalContentUpdate = false
  editorIsEmpty.value = editor.value?.isEmpty ?? true

  void hydrateMentionLabels(editor.value, supabase, newContent ?? '')
  void adoptOrphanMedia()

  // Skipping a focused editor stops a shared v-model from stealing focus on every
  // keystroke. The nextTick avoids a RangeError from the old selection in the new doc.
  if (!editor.value?.isFocused) {
    nextTick(() => {
      editor.value?.commands.focus('end')
    })
  }
})

// The outer editor skips content updates while expanded, so sync on close
watch(expandedOpen, async (isOpen) => {
  if (isOpen || !editor.value || editorMode.value === 'plain')
    return

  const currentMarkdown = getEditorMarkdown()
  if (currentMarkdown === (content.value ?? ''))
    return

  if (!editor.value?.view?.dom?.isConnected) {
    await nextTick()
    if (!editor.value?.view?.dom?.isConnected)
      return
  }

  externalContentUpdate = true
  editor.value.commands.setContent(content.value ?? '', {
    contentType: 'markdown',
  })
  externalContentUpdate = false
  editorIsEmpty.value = editor.value.isEmpty ?? true

  void adoptOrphanMedia()
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
  // Consumers with their own submit button must await this before reading the
  // model, or blob: URLs get persisted and render as "Missing or Deleted Media".
  flushPendingUploads,
  hasPendingUploads,
})

async function handleEditorModeSwitch() {
  const newMode = editorMode.value === 'rich' ? 'plain' : 'rich'

  if (newMode === 'plain') {
    plainTextContent.value = decodeHtmlEntities(content.value ?? '')
    nextTick(resizePlainTextarea)
  }
  else if (newMode === 'rich') {
    // The model keeps the escaped form. Tiptap gets raw angle brackets, which
    // noHtmlMarked keeps as text and getEditorMarkdown() re-escapes.
    const tiptapContent = plainTextContent.value
    let newContent = encodeHtmlEntities(tiptapContent)

    if (newContent) {
      newContent = await resolvePlainTextMentions(newContent, supabase)
    }

    content.value = newContent

    // Switch mode before setContent so onUpdate doesn't write back a mangled value
    editorMode.value = newMode

    // watch(content) won't fire here: handlePlainTextInput already keeps the
    // model in sync, so the value is usually unchanged.
    externalContentUpdate = true
    editor.value?.commands.setContent(tiptapContent, { contentType: 'markdown' })
    externalContentUpdate = false
    editorIsEmpty.value = editor.value?.isEmpty ?? true

    void hydrateMentionLabels(editor.value, supabase, newContent)
    void adoptOrphanMedia()

    return
  }

  editorMode.value = newMode
}

const expandedProps = computed(() => {
  const { label: _label, hint: _hint, ...rest } = props
  return rest
})

function handleExpandedSubmit() {
  emit('submit')
  expandedOpen.value = false
}

let submitted = false

async function handleSubmit() {
  if (!content.value || content.value.trim().length === 0)
    return

  isSubmitting.value = true

  try {
    if (pendingBlobs.size > 0) {
      const ok = await flushPendingUploads()
      if (!ok)
        return
    }

    if (editorMode.value === 'plain') {
      // The textarea binds the decoded text, so re-encode before submit
      content.value = encodeHtmlEntities(plainTextContent.value)

      // The Tiptap suggestion flow never ran, so resolve @username to @{uuid} here
      content.value = await resolvePlainTextMentions(content.value, supabase)
    }

    submitted = true
    emit('submit')
  }
  finally {
    isSubmitting.value = false
  }
}

onBeforeRouteLeave(() => {
  if (!editorIsEmpty.value && !submitted)
    // eslint-disable-next-line no-alert
    return window.confirm('You have unsent content. Leave anyway?')
})
</script>

<template>
  <div class="vui-rich-text">
    <label v-if="props.label" class="vui-label" :for="elementId">{{ props.label }}</label>
    <p v-if="props.hint" class="vui-hint">
      {{ props.hint }}
    </p>

    <RichTextMediaMenu v-if="editor && props.mediaContext" :editor :bucket-id="resolvedMediaBucketId" :media-context="props.mediaContext" @replace-pending-blob="handleReplacePendingBlob" />

    <EditorTableMenu v-if="editor && editorMode === 'rich'" :editor />

    <!-- Main editor instance -->
    <div
      class="relative editor-host"
      :class="{ 'is-uploading': isUploading,
                'is-submitting': isSubmitting || props.loading }"
      :inert="expandedOpen || isSubmitting || props.loading"
    >
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

      <EditorMathModal
        v-model:open="mathModalOpen"
        :initial-latex="mathModalLatex"
        :type="mathModalEditPos != null ? mathModalType : undefined"
        :edit-pos="mathModalEditPos"
        @confirm="handleMathConfirm"
      />

      <EditorYoutubeModal
        v-model:open="youtubeModalOpen"
        @confirm="handleYoutubeConfirm"
      />

      <EditorVideoModal
        v-model:open="videoModalOpen"
        @confirm="handleVideoConfirm"
      />

      <!-- Editor content & controls -->
      <div class="editor-container" :class="{ 'is-plain': editorMode === 'plain' }">
        <div v-if="hasPendingUploads" class="upload-progress-bar">
          <div class="upload-progress-bar__fill" :style="{ width: `${avgUploadProgress}%` }" />
        </div>
        <RichTextSelectionMenu v-if="editor" :editor :plain-text="editorMode === 'plain'" :textarea-el="editorMode === 'plain' ? plainTextarea ?? null : null" />

        <div v-show="editorMode === 'rich'" class="editor-rich-wrapper">
          <span v-if="editorIsEmpty && props.placeholder" class="editor-placeholder">{{ props.placeholder }}</span>
          <EditorContextMenu v-if="editor" :editor="editor">
            <EditorContent :id="elementId" :editor="editor" class="typeset" @keydown.enter.stop />
          </EditorContextMenu>
          <EditorContent v-else :id="elementId" :editor="editor" class="typeset" @keydown.enter.stop />
        </div>
        <textarea
          v-show="editorMode === 'plain'"
          ref="plain-textarea"
          class="plain-textarea"
          :value="plainTextContent"
          :placeholder="placeholder"
          @input="handlePlainTextInput(($event.target as HTMLTextAreaElement).value)"
          @keydown.ctrl.enter="handleSubmit"
          @keydown.meta.enter="handleSubmit"
        />

        <div class="editor-actions">
          <Tooltip v-if="props.showExpandButton && (!isMobile || props.alwaysShowExpandButton)">
            <Button plain square size="s" @click="expandedOpen = true">
              <Icon name="ph:arrows-out" />
            </Button>
            <template #tooltip>
              <p>Expand editor</p>
            </template>
          </Tooltip>

          <Tooltip v-if="props.showAttachmentButton">
            <template #tooltip>
              <p>Insert content</p>
            </template>
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
                Attach files
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
                Embed video
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

            <input ref="file-input" class="visually-hidden" type="file" multiple :accept="`${allowedMediaExtensions},${allowedDataExtensions}`" @input="handleCombinedFileInput">
          </Tooltip>

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

            <Button size="s" type="submit" :disabled="isSubmitting || props.loading" @click="handleSubmit">
              Send
              <template #end>
                <Spinner v-if="isSubmitting || props.loading" size="s" />
                <Icon v-else name="ph:paper-plane-tilt" />
              </template>
            </Button>
          </ButtonGroup>
        </div>
      </div>
    </div>

    <!-- Limit & errors -->
    <p v-if="limit && editor" class="vui-input-limit">
      {{ `${editor.storage.characterCount.characters()} / ${limit}` }}
    </p>

    <ul v-if="errors.length > 0" class="vui-input-errors">
      <li v-for="err in errors" :key="err">
        {{ err }}
      </li>
    </ul>

    <Modal
      :open="expandedOpen"
      size="screen"
      scrollable
      class="rich-text-expand-modal"
      @close="expandedOpen = false"
    >
      <template #header />

      <div class="rich-text-expand-body">
        <RichTextEditor
          v-bind="expandedProps"
          v-model="content"
          v-model:nsfw="isNsfw"
          :errors="errors"
          :show-expand-button="false"
          :fullscreen-on-mobile="false"
          min-height="calc(100vh - 142px)"
          max-height="100%"
          @submit="handleExpandedSubmit"
        />
      </div>
    </Modal>
  </div>
</template>

<style lang="scss">
.rich-text-expand-modal {
  :deep(.vui-card-content) {
    overflow: hidden !important;
    display: flex;
    flex-direction: column;
  }
}

.rich-text-expand-body {
  flex: 1;
  min-height: 0;
  max-width: var(--container-m);
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-s);

  .vui-rich-text {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .editor-host {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .editor-container {
    flex: 1;
    min-height: 0;
    max-height: none !important;
  }
}

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
    resize: none;
    font-family: inherit;
    font-size: var(--font-size-m);
    color: var(--color-text);
    // Textarea always removes a bit of its min-height so that floating menu does not cause layout shift
    min-height: v-bind(minHeightPlain) !important;
    height: unset;
  }

  .is-submitting {
    opacity: 0.4;
    pointer-events: none;
    transition: opacity var(--transition-slow);
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
    overflow: hidden;

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

      ul[data-type='taskList'] {
        list-style: none;
        padding-left: var(--space-xs);

        // Plain li, since data-type attribute resolution is unreliable on the node-view element
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

          // contentDOM holding the paragraph text
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

          &[data-checked='true'] > div > p {
            color: var(--color-text-lighter);
            // text-decoration: line-through;
          }
        }
      }

      // The VUI reset sets `span, strong, p { font-size: var(--font-size-m) }`, which
      // shrinks inline marks inside headings back to paragraph size.
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

    // The ImageGroup plugin sets data-img-run-index and data-img-run-total on
    // consecutive media. Rows use an 8px gap, subtracted per item in the widths.
    .ProseMirror > img[data-img-run-total],
    .ProseMirror > div[data-video-embed][data-img-run-total],
    .ProseMirror > div[data-img-node][data-img-run-total] {
      display: inline-block;
      vertical-align: top;
      max-height: 240px;
      max-width: none;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      border-radius: var(--border-radius-s);
      margin-top: 0;
      margin-bottom: var(--space-xs);
    }

    .ProseMirror > div[data-video-embed][data-img-run-total] {
      display: inline-block;
      vertical-align: top;
      overflow: hidden;
      position: relative;

      video {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
    }

    .ProseMirror > div[data-img-node][data-img-run-total] {
      display: inline-block;
      vertical-align: top;
      overflow: hidden;
      position: relative;

      img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
    }

    .ProseMirror > div[data-img-node]:not([data-img-run-total]) {
      display: block;

      img {
        display: block;
        max-width: 100%;
        height: auto;
      }
    }

    .ProseMirror > img[data-img-run-total='2'],
    .ProseMirror > div[data-video-embed][data-img-run-total='2'],
    .ProseMirror > div[data-img-node][data-img-run-total='2'] {
      width: calc(50% - 4px);
    }

    .ProseMirror > img[data-img-run-total='2'][data-img-run-index='0'],
    .ProseMirror > div[data-video-embed][data-img-run-total='2'][data-img-run-index='0'],
    .ProseMirror > div[data-img-node][data-img-run-total='2'][data-img-run-index='0'] {
      margin-right: 8px;
    }

    .ProseMirror > img[data-img-run-total='3'],
    .ProseMirror > div[data-video-embed][data-img-run-total='3'],
    .ProseMirror > div[data-img-node][data-img-run-total='3'] {
      width: calc(33.333% - 6px);
    }

    .ProseMirror > img[data-img-run-total='3'][data-img-run-index='0'],
    .ProseMirror > img[data-img-run-total='3'][data-img-run-index='1'],
    .ProseMirror > div[data-video-embed][data-img-run-total='3'][data-img-run-index='0'],
    .ProseMirror > div[data-video-embed][data-img-run-total='3'][data-img-run-index='1'],
    .ProseMirror > div[data-img-node][data-img-run-total='3'][data-img-run-index='0'],
    .ProseMirror > div[data-img-node][data-img-run-total='3'][data-img-run-index='1'] {
      margin-right: 8px;
    }

    @media (max-width: 600px) {
      .ProseMirror > img:not([data-img-run-total]),
      .ProseMirror > div[data-img-node]:not([data-img-run-total]) img {
        width: 100%;
        height: auto;
        max-height: none;
        aspect-ratio: unset;
        object-fit: unset;
      }

      .ProseMirror > img[data-img-run-total],
      .ProseMirror > div[data-video-embed][data-img-run-total],
      .ProseMirror > div[data-img-node][data-img-run-total] {
        display: block;
        width: 100%;
        max-width: 100%;
        max-height: 40vh;
        margin-right: 0;
        aspect-ratio: unset;
        object-fit: cover;
      }
    }

    .editor-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-xs);
    }

    .upload-progress-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: var(--color-bg-raised);
      border-radius: 0 0 var(--border-radius-s) var(--border-radius-s);
      overflow: hidden;
      z-index: var(--z-active);

      &__fill {
        height: 100%;
        background: var(--color-accent);
        transition: width 0.2s ease;
      }
    }
  }

  // The placeholder is Vue-rendered. A ProseMirror decoration can read
  // `editor.isEmpty` wrong on mount, before the view is wired up.
  .editor-rich-wrapper {
    max-height: 90vh;
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

  img.ProseMirror-selectednode,
  div[data-img-node].ProseMirror-selectednode {
    outline: 2px solid var(--color-text);
  }

  // Broken image placeholder
  .ProseMirror > div[data-img-node]:has(img.img-error) {
    position: relative;
    overflow: hidden;
    background-color: var(--color-bg-raised);
    border-radius: var(--border-radius-s);

    &:not([data-img-run-total]) {
      aspect-ratio: 16 / 9;
      width: 100%;
    }

    img {
      display: none;
    }

    &::before {
      content: '';
      position: absolute;
      inset: 0;
      background-image: url('/landing/noise.gif');
      background-size: 120px;
      background-repeat: repeat;
      opacity: 0.05;
      z-index: 1;
    }

    &::after {
      content: 'Missing or deleted media';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: var(--font-size-xs);
      color: var(--color-text);
      background: var(--color-bg-medium);
      padding: var(--space-xxs) var(--space-xs);
      border-radius: var(--border-radius-s);
      white-space: nowrap;
      z-index: 2;
    }
  }

  // Upload states key off blob: URLs, so they clear once the storage URL is in.
  // Videos get a spinner because the element renders black while loading.
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

  .is-uploading .ProseMirror img[src^='blob:'] {
    animation: upload-shimmer 1.4s ease-in-out infinite;
    border-radius: var(--border-radius-s);
  }

  .is-uploading .ProseMirror div[data-video-embed]:has(video[src^='blob:']) {
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

  .ProseMirror div[data-video-embed]:not([data-img-run-total]) {
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

  // Native controls stand in while editing. Rendered markdown uses AudioPlayer.
  .ProseMirror div[data-audio-embed] {
    margin: var(--space-s) 0;

    audio {
      width: 100%;
      max-width: 420px;
    }

    &.ProseMirror-selectednode audio {
      outline: 2px solid var(--color-accent);
      border-radius: var(--border-radius-l);
    }
  }

  .mention,
  .channel-mention {
    background-color: color-mix(in srgb, var(--color-bg-accent-lowered) 20%, transparent);
    border-radius: var(--border-radius-m);
    box-decoration-break: clone;
    color: var(--color-accent);
    padding: 0.4rem;
  }

  // The Details extension renders a custom node view, not a real <details>:
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

    display: grid;
    grid-template-columns: 28px 1fr;

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

      list-style: none;
      &::-webkit-details-marker {
        display: none;
      }
    }

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

      // Always shown while editing so users can click into it
      &[hidden] {
        display: block !important;
        opacity: 0.35;
      }
    }
  }

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

.datafile-node {
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-s);
  background-color: var(--color-bg-raised);
  margin: var(--space-xs) 0;
  padding: var(--space-xs) var(--space-s);

  &.ProseMirror-selectednode {
    outline: 2px solid var(--color-accent);
  }

  .datafile-node__inner {
    display: flex;
    align-items: center;
    gap: var(--space-s);
  }

  .datafile-node__icon {
    font-family: monospace;
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    flex-shrink: 0;
  }

  .datafile-node__name {
    font-size: var(--font-size-xs);
    color: var(--color-text);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .datafile-node__link {
    font-size: var(--font-size-xs);
    color: var(--color-accent);
    text-decoration: none;
    flex-shrink: 0;

    &:hover {
      text-decoration: underline;
    }
  }
}

.link-embed-node {
  display: block;
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-accent);
  border-radius: var(--border-radius-s);
  background-color: var(--color-bg-raised);
  padding: var(--space-s) var(--space-m);
  margin: var(--space-xs) 0;
  cursor: default;
  user-select: none;

  &.ProseMirror-selectednode {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .link-embed-node__eyebrow {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
    margin-bottom: var(--space-xxs);
  }

  .link-embed-node__url {
    font-size: var(--font-size-xs);
    color: var(--color-text-light);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
