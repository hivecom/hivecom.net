<script setup lang="ts">
import type { StorageBucketId } from '@/lib/storageAssets'
import type { Database } from '@/types/database.types'
import { useSupabaseClient } from '#imports'
import { Button, ButtonGroup, pushToast, Textarea } from '@dolanske/vui'
import { Extension } from '@tiptap/core'
import FileHandler from '@tiptap/extension-file-handler'
import Image from '@tiptap/extension-image'
import { Mathematics } from '@tiptap/extension-mathematics'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import Youtube from '@tiptap/extension-youtube'
import { CharacterCount } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { marked } from 'marked'
import { computed, nextTick, ref, useId, watch } from 'vue'
import ContentRulesModal from '@/components/Shared/ContentRulesModal.vue'
import { useUserId } from '@/composables/useUserId'
import { allowedMediaExtensions, allowedMediaTypes } from '@/lib/storage'
import { FORUMS_BUCKET_ID } from '@/lib/storageAssets'
import EditorMathModal from './EditorMathModal.vue'
import EditorYoutubeModal from './EditorYoutubeModal.vue'
import { createMentionExtension, hydrateMentionLabels, resolvePlainTextMentions } from './plugins/mentions'
import { TextColor } from './plugins/textColor'
import RichTextImageMenu from './RichTextImageMenu.vue'
import RichTextSelectionMenu from './RichTextSelectionMenu.vue'

const {
  errors = [],
  minHeight = '47px',
  ...props
} = defineProps<Props>()

const emit = defineEmits<{
  (e: 'submit'): void
}>()

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
}

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

function encodeHtmlEntities(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function decodeHtmlEntities(str: string): string {
  return str.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
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

const userId = useUserId()
const fetchedContentRulesAgreement = ref<boolean | null>(null)
const localAgreedContentRules = ref<boolean | null>(null)

async function refreshContentRulesAgreement() {
  const id = userId.value

  if (!id) {
    fetchedContentRulesAgreement.value = null
    return
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('agreed_content_rules')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    pushToast('Error checking content rules', {
      description: error.message,
    })
    return
  }

  if (!data)
    return

  fetchedContentRulesAgreement.value = data.agreed_content_rules
  localAgreedContentRules.value = null
}

watch(userId, () => {
  void refreshContentRulesAgreement()
}, { immediate: true })

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
        const match = /^<(?:[a-z][a-z0-9-]*(?:\s[^>]*)?\/?|\/[a-z][a-z0-9-]*\s*|!--[\s\S]*?--)>/i.exec(src)
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
    // Text color (triple-colon directive: :::color[#rrggbb]text:::)
    TextColor,
    // Checklist / task list support (markdown: - [ ] / - [x])
    TaskList,
    TaskItem.configure({ nested: true }),
    // User mentions
    createMentionExtension(supabase),

    // Media content setting for file uploads
    ...(props.mediaContext
      ? [FileHandler.configure({
          onPaste: (_, files) => handleFileUpload(files),
          onDrop: (_, files, pos) => handleFileUpload(files, pos),
          allowedMimeTypes: allowedMediaTypes,
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
  ],
  contentType: 'markdown',
  onCreate: () => {
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

    // Collect image srcs present in the document before this transaction
    const prevSrcs = new Set<string>()
    transaction.before.descendants((node) => {
      if (node.type.name === 'image' && typeof node.attrs.src === 'string')
        prevSrcs.add(node.attrs.src)
    })

    if (prevSrcs.size === 0)
      return

    // Collect image srcs present in the document after this transaction
    const nextSrcs = new Set<string>()
    transaction.doc.descendants((node) => {
      if (node.type.name === 'image' && typeof node.attrs.src === 'string')
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
  // @tiptap/extension-paragraph emits "&nbsp;" for every empty paragraph —
  // not just the trailing one — so we must replace all of them.
  // A line whose only content is "&nbsp;" represents an empty paragraph;
  // replace it with a genuinely empty line so the plain-text view is clean.
  // We also strip a lone trailing "&nbsp;" that has no preceding newline
  // (single-paragraph empty doc edge-case).
  const stripped = raw
    .replace(/^&nbsp;$/gm, '')
    .replace(/&nbsp;$/, '')
    // Escape any HTML tag-like sequences (<...>) so they are stored and rendered
    // as visible literal text rather than being interpreted as HTML by the
    // markdown renderer. Tiptap now stores these as raw angle-bracket text nodes
    // (the noHtmlMarked inline interceptor prevents them from being parsed as
    // real HTML on input), so we must re-escape them on the way out.
    .replace(/<([^>]*)>/g, '&lt;$1&gt;')
  return stripped.trim() === '' ? '' : stripped
}

// Upload file into the bucket and set the editor node URL
function handleFileUpload(files: File[] | null, pos?: number) {
  if (!files)
    return

  files.forEach(async (file) => {
    if (!editor.value)
      return

    const format = file.type.split('/')[1]
    const fileUrl = `${props.mediaContext}/${crypto.randomUUID()}.${format}`

    // Path to the public image upload
    const { error } = await supabase.storage
      .from(resolvedMediaBucketId.value)
      .upload(fileUrl, file, { contentType: file.type })

    if (error) {
      pushToast('Error uploading media', {
        description: error.message,
      })
    }
    else {
      const { data } = supabase.storage
        .from(resolvedMediaBucketId.value)
        .getPublicUrl(fileUrl)

      editor.value
        .chain()
        .insertContentAt(pos ?? editor.value.state.selection.anchor, {
          type: 'image',
          attrs: { src: data.publicUrl },
        })
        .focus()
        .run()
    }
  })
}

// Converts the FileList from @input event into a File[]

const fileInput = useTemplateRef('file-input')
function handleFileInput(event: Event) {
  const files = (event.target as HTMLInputElement).files
  if (!files)
    return
  handleFileUpload(Array.from(files))
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
  // value back into the model — stripping any HTML the user just typed.
  // The plainTextContent ref is kept in sync separately via handlePlainTextInput,
  // except when content is cleared externally (e.g. after submit) — in that case
  // we must reset plainTextContent too so the textarea actually clears.
  if (editorMode.value === 'plain') {
    if (!newContent) {
      plainTextContent.value = ''
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
const resolvedAgreedContentRules = computed(() => localAgreedContentRules.value ?? fetchedContentRulesAgreement.value)
const shouldShowContentRulesOverlay = computed(() => resolvedAgreedContentRules.value === false)

watch(contentRulesModalOpen, (open, wasOpen) => {
  if (wasOpen && !open)
    void refreshContentRulesAgreement()
})

async function handleContentRulesConfirmed() {
  localAgreedContentRules.value = true
  fetchedContentRulesAgreement.value = true
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
  }
  else if (newMode === 'rich') {
    // The model always stores the escaped form (&lt;/&gt;) for the DB/renderer.
    // Tiptap receives the decoded form (raw angle brackets) — the noHtmlMarked
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
    // (which is common — handlePlainTextInput keeps content in sync while the
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
    // Ensure the final value in the model is properly escaped — the textarea
    // binds to plainTextContent (decoded) so we must re-encode before submit.
    content.value = encodeHtmlEntities(plainTextContent.value)

    // In plain-text mode the Tiptap suggestion flow never ran, so any @username
    // tokens must be resolved to @{uuid} before the content is submitted.
    content.value = await resolvePlainTextMentions(content.value, supabase)
  }

  emit('submit')
}

// Media update
</script>

<template>
  <div class="vui-rich-text">
    <label v-if="props.label" class="vui-label" :for="elementId">{{ props.label }}</label>
    <p v-if="props.hint" class="vui-hint">
      {{ props.hint }}
    </p>

    <!-- Text selection menu -->
    <RichTextSelectionMenu v-if="editor" :editor />

    <!-- Image context menu -->
    <RichTextImageMenu v-if="editor && props.mediaContext" :editor :bucket-id="resolvedMediaBucketId" :media-context="props.mediaContext" />

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

      <!-- Editor content & controls -->
      <div class="editor-container" :class="{ 'is-plain': editorMode === 'plain' }">
        <div v-if="editorMode === 'rich'" class="editor-rich-wrapper">
          <span v-if="editorIsEmpty && props.placeholder" class="editor-placeholder">{{ props.placeholder }}</span>
          <EditorContent :id="elementId" :editor="editor" class="typeset" @keydown.enter.stop />
        </div>
        <Textarea v-else :model-value="plainTextContent" class="editor-textarea" expand :placeholder="placeholder" @update:model-value="handlePlainTextInput" @keydown.ctrl.enter="handleSubmit" @keydown.meta.enter="handleSubmit" />

        <div class="editor-actions">
          <template v-if="editorMode === 'rich'">
            <Tooltip>
              <Button plain square size="s" @click="() => { mathModalEditPos = null; mathModalType = 'inline'; mathModalLatex = ''; mathModalOpen = true }">
                <Icon name="ph:sigma" />
              </Button>
              <template #tooltip>
                <p>Insert math</p>
              </template>
            </Tooltip>
            <Tooltip>
              <Button plain square size="s" @click="youtubeModalOpen = true">
                <Icon name="ph:youtube-logo" />
              </Button>
              <template #tooltip>
                <p>Embed YouTube video</p>
              </template>
            </Tooltip>
          </template>

          <Tooltip>
            <Button plain square size="s" @click="handleEditorModeSwitch">
              <Icon :name="editorMode === 'rich' ? 'ph:pen-nib' : 'ph:markdown-logo'" />
            </Button>
            <template #tooltip>
              <p>{{ editorMode === 'rich' ? 'Switch to plain text' : 'Switch to rich text' }}</p>
            </template>
          </Tooltip>

          <template v-if="props.showAttachmentButton">
            <Tooltip>
              <Button plain square size="s" @click="fileInput?.click()">
                <Icon name="ph:paperclip" />
              </Button>
              <template #tooltip>
                <p>Attach a file</p>
              </template>
            </Tooltip>

            <input ref="file-input" class="visually-hidden" type="file" :accept="allowedMediaExtensions" @input="handleFileInput">
          </template>

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

  .editor-textarea .vui-input textarea {
    padding: 0 !important;
    height: v-bind(minHeight);
    min-height: v-bind(minHeight) !important;
    border: none !important;
    border-radius: 0 !important;
    background-color: transparent !important;
    outline: none !important;
    margin: 0 !important;
    line-height: var(--line-height-base) !important;
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

  .mention {
    background-color: color-mix(in srgb, var(--color-bg-accent-lowered) 20%, transparent);
    border-radius: var(--border-radius-m);
    box-decoration-break: clone;
    color: var(--color-accent);
    padding: 0.4rem;
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
