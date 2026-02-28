<script setup lang="ts">
import type { StorageBucketId } from '@/lib/storageAssets'
import type { Database } from '@/types/database.types'
import { useSupabaseClient } from '#imports'
import { Button, ButtonGroup, pushToast, Textarea } from '@dolanske/vui'
import FileHandler from '@tiptap/extension-file-handler'
import Image from '@tiptap/extension-image'
import { CharacterCount, Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { computed, ref, useId, watch } from 'vue'
import ContentRulesModal from '@/components/Shared/ContentRulesModal.vue'
import { useUserId } from '@/composables/useUserId'
import { FORUMS_BUCKET_ID } from '@/lib/storageAssets'
import { createMentionExtension, hydrateMentionLabels } from './plugins/mentions'
import RichTextSelectionMenu from './RichTextSelectionMenu.vue'

const {
  errors = [],
  minHeight = '47px',
  showActions = false,
  ...props
} = defineProps<Props>()

const emit = defineEmits<{
  (e: 'submit'): void
}>()

// TODO: Code block highlighting & dropdown for seleting language

// TODO: hivecom emote sticker / custom emojis & normal emojis too

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
  showActions?: boolean
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

const content = defineModel<string>()

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

const editor = useEditor({
  content: content.value,
  extensions: [
    StarterKit,
    Markdown,
    Placeholder.configure({
      placeholder: props.placeholder,

    }),
    Image,
    // User mentions
    createMentionExtension(supabase),
    // Media content setting for file uploads
    ...(props.mediaContext
      ? [FileHandler.configure({
          onPaste: (_, files) => handleFileUpload(files),
          onDrop: (_, files, pos) => handleFileUpload(files, pos),
          allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
        })]
      : []),
    // Character limit
    ...(props.limit
      ? [CharacterCount.configure({ limit: props.limit })]
      : []),
  ],
  contentType: 'markdown',
  onUpdate: () => {
    content.value = editor.value?.getMarkdown() || ''
  },
})

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

// If content is changed externally, make sure mentions are hydrated
watch(() => editor.value, (value) => {
  if (value) {
    hydrateMentionLabels(value, supabase, content.value ?? '')
  }
}, { immediate: true })

// Update editor content manually on model change
watch(content, (newContent) => {
  if (editor.value?.getMarkdown() === newContent) {
    return
  }

  editor.value?.commands.setContent(newContent ?? '', {
    contentType: 'markdown',
  })

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

function handleSubmit() {
  if (content.value && content.value.trim().length > 0) {
    emit('submit')
  }
}
</script>

<template>
  <div class="vui-rich-text">
    <label v-if="props.label" class="vui-label" :for="elementId">{{ props.label }}</label>
    <p v-if="props.hint" class="vui-hint">
      {{ props.hint }}
    </p>

    <!-- Text selection menu -->
    <RichTextSelectionMenu v-if="editor" :editor />

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

      <!-- Editor content & controls -->
      <div class="editor-container" :class="{ 'is-plain': editorMode === 'plain' }">
        <EditorContent v-if="editorMode === 'rich'" :id="elementId" :editor="editor" class="typeset" @keydown.enter.stop />
        <Textarea v-else v-model="content" expand :placeholder="placeholder" />

        <div v-if="showActions" class="editor-actions">
          <Button square size="s" :data-title-top="editorMode === 'rich' ? 'Switch to plain text' : 'Switch to rich text'" @click="editorMode = editorMode === 'rich' ? 'plain' : 'rich'">
            <Icon :name="editorMode === 'rich' ? 'ph:pen-nib' : 'ph:markdown-logo'" />
          </Button>

          <ButtonGroup :gap="2">
            <Button square size="s" data-title-top="Attach a file" @click="fileInput?.click()">
              <Icon name="ph:paperclip" />
            </Button>

            <input ref="file-input" class="visually-hidden" type="file" accept="image/png, image/jpeg, image/gif, image/webp" @input="handleFileInput">

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

  .vui-input-container .vui-input textarea {
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
    }

    .editor-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-xs);
    }
  }

  // Placeholder styling
  .tiptap p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
    font-weight: var(--font-weight);
    color: var(--color-text-lighter);
    font-family: var(--font);
  }

  hr.ProseMirror-selectednode {
    border-color: var(--color-border-strong);
  }

  img.ProseMirror-selectednode {
    outline: 2px solid var(--color-text);
  }

  .mention {
    background-color: color-mix(in srgb, var(--color-bg-accent-lowered) 20%, transparent);
    border-radius: var(--border-radius-m);
    box-decoration-break: clone;
    color: var(--color-accent);
    padding: 0.4rem;
  }
}

.rich-text-mention-menu {
  padding: var(--space-xs);
  background-color: var(--color-bg-raised);
  box-shadow: var(--box-shadow-strong);
  border-radius: var(--border-radius-m);
  z-index: var(--z-popout);
}
</style>
