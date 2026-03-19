<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, Card, Flex, Input, pushToast, Sheet, Switch, Textarea, Tooltip } from '@dolanske/vui'
import RichTextEditor from '@/components/Editor/RichTextEditor.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import { useDiscussionCache } from '@/composables/useDiscussionCache'
import { FORUMS_BUCKET_ID } from '@/lib/storageAssets'
import { slugify } from '@/lib/utils/formatting'

type DiscussionRecord = Tables<'discussions'>

const props = defineProps<{
  discussion: DiscussionRecord | null
}>()

const emit = defineEmits<{
  updated: [discussion: DiscussionRecord]
  deleted: [discussionId: string]
}>()

const isOpen = defineModel<boolean>('isOpen')

const supabase = useSupabaseClient()
const discussionCache = useDiscussionCache()
const { hasPermission } = useAdminPermissions()

const canDelete = computed(() => hasPermission('discussions.delete'))

// Form state
const title = ref('')
const slug = ref('')
const description = ref('')
const markdown = ref('')
const isSticky = ref(false)

const saveLoading = ref(false)
const deleteLoading = ref(false)
const showDeleteConfirm = ref(false)
const markdownLoading = ref(false)

watch(
  () => props.discussion?.id,
  async () => {
    title.value = props.discussion?.title ?? ''
    slug.value = props.discussion?.slug ?? ''
    description.value = props.discussion?.description ?? ''
    isSticky.value = props.discussion?.is_sticky ?? false

    // markdown is not included in the table query - fetch it separately
    if (!props.discussion?.id) {
      markdown.value = ''
      return
    }

    // If it was already fetched and attached to the record, use it directly
    if (props.discussion.markdown != null) {
      markdown.value = props.discussion.markdown
      return
    }

    markdownLoading.value = true
    try {
      const { data } = await supabase
        .from('discussions')
        .select('markdown')
        .eq('id', props.discussion.id)
        .maybeSingle()
      markdown.value = data?.markdown ?? ''
    }
    catch {
      markdown.value = ''
    }
    finally {
      markdownLoading.value = false
    }
  },
  { immediate: true },
)

function applySlugFromTitle() {
  slug.value = slugify(title.value)
}

function handleClose() {
  isOpen.value = false
}

async function handleSave() {
  if (!props.discussion)
    return

  saveLoading.value = true

  try {
    const { data, error } = await supabase
      .from('discussions')
      .update({
        title: title.value.trim() || null,
        slug: slug.value.trim() || null,
        description: description.value.trim() || null,
        markdown: markdown.value.trim() || null,
        is_sticky: isSticky.value,
      })
      .eq('id', props.discussion.id)
      .select()
      .maybeSingle()

    if (error)
      throw error

    if (data) {
      discussionCache.set(data as DiscussionRecord)
      emit('updated', data as DiscussionRecord)
    }

    pushToast('Discussion saved')
    handleClose()
  }
  catch (error) {
    pushToast('Failed to save discussion', {
      description: error instanceof Error ? error.message : 'Unknown error',
    })
  }
  finally {
    saveLoading.value = false
  }
}

async function handleDelete() {
  if (!props.discussion)
    return

  deleteLoading.value = true

  try {
    const { error } = await supabase
      .from('discussions')
      .delete()
      .eq('id', props.discussion.id)

    if (error)
      throw error

    discussionCache.invalidate(props.discussion.id, props.discussion.slug)
    emit('deleted', props.discussion.id)
    showDeleteConfirm.value = false
    handleClose()
    pushToast('Discussion deleted')
  }
  catch (error) {
    pushToast('Failed to delete discussion', {
      description: error instanceof Error ? error.message : 'Unknown error',
    })
  }
  finally {
    deleteLoading.value = false
  }
}
</script>

<template>
  <Sheet
    :open="!!props.discussion && isOpen"
    position="right"
    :card="{ separators: true }"
    :size="700"
    @close="handleClose"
  >
    <template #header>
      <Flex column :gap="0">
        <h4>Edit Discussion</h4>
        <p v-if="props.discussion" class="text-color-light text-xs">
          {{ props.discussion.title || 'Untitled discussion' }}
        </p>
      </Flex>
    </template>

    <Flex v-if="props.discussion" column gap="l">
      <!-- Identity -->
      <Flex column gap="m" expand>
        <h5>Identity</h5>

        <Input
          v-model="title"
          label="Title"
          placeholder="Untitled discussion"
          expand
        />

        <Flex column gap="xs">
          <Flex x-between y-center>
            <span class="text-s" style="font-weight: var(--font-weight-medium);">Slug</span>
            <button class="slugify-btn text-xs text-color-accent" type="button" @click="applySlugFromTitle">
              Slugify title
            </button>
          </Flex>
          <Input
            v-model="slug"
            placeholder="my-discussion-slug"
            expand
          />
        </Flex>

        <Textarea
          v-model="description"
          label="Description"
          placeholder="Optional short description"
          expand
          :rows="2"
          :resize="false"
        />
      </Flex>

      <!-- Content -->
      <Flex column gap="m" expand>
        <h5>Content</h5>

        <RichTextEditor
          v-model="markdown"
          placeholder="Discussion body (optional)"
          min-height="200px"
          :media-context="props.discussion.id ? `forums/${props.discussion.id}/markdown/media` : undefined"
          :media-bucket-id="FORUMS_BUCKET_ID"
          :show-attachment-button="!!props.discussion.id"
        />
      </Flex>

      <!-- Settings -->
      <Flex column gap="m">
        <h5>Settings</h5>

        <Card class="card-bg">
          <Flex column gap="m">
            <Flex x-between y-center>
              <Flex column :gap="0">
                <span class="text-s text-bold">Pinned</span>
                <span class="text-xs text-color-light">Pin to the top of the topic</span>
              </Flex>
              <Tooltip v-if="!props.discussion.discussion_topic_id">
                <Switch :model-value="false" :disabled="true" />
                <template #tooltip>
                  <p>Only forum discussions can be pinned</p>
                </template>
              </Tooltip>
              <Switch
                v-else
                v-model="isSticky"
              />
            </Flex>
          </Flex>
        </Card>
      </Flex>

      <!-- Metadata -->
      <Metadata
        :created-at="props.discussion.created_at"
        :created-by="props.discussion.created_by"
        :modified-at="props.discussion.modified_at"
        :modified-by="props.discussion.modified_by"
        show-system-user-for-missing-created-by
      />
    </Flex>

    <template #footer>
      <Flex y-center gap="xs" expand>
        <Button
          variant="accent"
          :loading="saveLoading"
          @click="handleSave"
        >
          <template #start>
            <Icon name="ph:check" />
          </template>
          Save
        </Button>

        <Button variant="gray" @click="handleClose">
          Cancel
        </Button>

        <div class="footer-spacer" />

        <Tooltip v-if="canDelete">
          <Button
            variant="danger"
            square
            :loading="deleteLoading"
            @click="showDeleteConfirm = true"
          >
            <Icon name="ph:trash" />
          </Button>
          <template #tooltip>
            <p>Delete discussion</p>
          </template>
        </Tooltip>
      </Flex>
    </template>
  </Sheet>

  <ConfirmModal
    v-if="props.discussion"
    v-model:open="showDeleteConfirm"
    :confirm="handleDelete"
    :confirm-loading="deleteLoading"
    title="Delete discussion"
    :description="`Are you sure you want to delete '${props.discussion.title || 'this discussion'}'? This action cannot be undone.`"
    confirm-text="Delete"
    cancel-text="Cancel"
    :destructive="true"
  />
</template>

<style scoped lang="scss">
.slugify-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: inherit;

  &:hover {
    text-decoration: underline;
  }
}

.footer-spacer {
  flex: 1;
}
</style>
