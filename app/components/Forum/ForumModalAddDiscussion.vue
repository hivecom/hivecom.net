<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { defineRules, maxLength, minLenNoSpace, required, useValidation } from '@dolanske/v-valid'
import { Button, ButtonGroup, Card, Dropdown, DropdownTitle, Flex, Grid, Input, Modal, pushToast, searchString, Switch, Tab, Tabs, Tooltip } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'
import { FORUMS_BUCKET_ID } from '@/lib/storageAssets'
import { composedPathToString, composePathToTopic } from '@/lib/topics'
import { normalizeErrors, slugify } from '@/lib/utils/formatting'
import RichTextEditor from '../Editor/RichTextEditor.vue'
import ConfirmModal from '../Shared/ConfirmModal.vue'

interface Props {
  open: boolean
  editedItem?: Tables<'discussions'>
  drafts?: Tables<'discussions'>[]
  hideTabs?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', discussion: Tables<'discussions'>): void
  (e: 'draftUpdated'): void
}>()

// Check if the current user has discussions.update permission by querying the DB directly.
// This works regardless of which layout (admin or default) renders the component.
const canUpdateDiscussions = ref(false)

const isMobile = useBreakpoint('<s')
const router = useRouter()

const supabase = useSupabaseClient()
const userId = useUserId()

onBeforeMount(async () => {
  const uid = userId.value
  if (!uid)
    return

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', uid)
    .maybeSingle()

  if (!roleData?.role)
    return

  const { data: permData } = await supabase
    .from('role_permissions')
    .select('permission')
    .eq('role', roleData.role)
    .eq('permission', 'discussions.update')
    .maybeSingle()

  canUpdateDiscussions.value = !!permData
})

const search = ref('')
const editingDraft = ref<Tables<'discussions'> | null>(null)
const editedDiscussion = computed(() => props.editedItem ?? editingDraft.value)
const isEditing = computed(() => !!editedDiscussion.value)
const showTabs = computed(() => props.hideTabs !== true && !isEditing.value)
const publishConfirmOpen = ref(false)

// Draft state
const activeTab = ref<'create' | 'drafts'>('create')
const drafts = ref<Tables<'discussions'>[]>([])
const deleteLoading = ref(false)
const deleteConfirm = ref<string | null>(null)

watch(() => props.editedItem, (item) => {
  if (item) {
    editingDraft.value = null
  }
})

// Inject provided values from parent
const injectedTopics = inject<() => Ref<Tables<'discussion_topics'>[]>>('forumTopics', () => ref([]))()
const activeTopicId = inject<() => Ref<string | null>>('forumActiveTopicId', () => ref(null))()
const fallbackTopics = ref<Tables<'discussion_topics'>[]>([])
const resolvedTopics = computed(() => injectedTopics.value.length ? injectedTopics.value : fallbackTopics.value)

onBeforeMount(() => {
  if (injectedTopics.value.length)
    return

  supabase
    .from('discussion_topics')
    .select('*')
    .then(({ data }) => {
      if (data) {
        fallbackTopics.value = data
      }
    })
})

// Options to optionally select a parent topic. A 1-level deep list which
// contains paths to possibly deeply nested topics
const topicOptions = computed(() => {
  return resolvedTopics.value
    .filter(item => item.id === editedDiscussion.value?.discussion_topic_id || (!item.is_archived && (canUpdateDiscussions.value || !item.is_locked)))
    .map(topic => ({
      id: topic.id,
      label: topic.name,
      parent_id: topic.id,
      path: composedPathToString(composePathToTopic(topic.id, resolvedTopics.value)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .filter(topic => search.value ? searchString([topic.label, topic.path], search.value) : true)
})

const form = reactive<{
  title: string
  slug: string
  description: string
  markdown: string
  is_locked: boolean
  is_sticky: boolean
  is_draft: boolean
  discussion_topic_id: string | null
}>({
  title: '',
  slug: '',
  description: '',
  markdown: '',
  is_locked: false,
  is_sticky: false,
  is_draft: true,
  discussion_topic_id: null,
})

const isPublishingFromDraft = computed(() => {
  const edited = editedDiscussion.value
  return !!edited && edited.is_draft && !form.is_draft
})

const showDraftTooltip = computed(() => {
  const edited = editedDiscussion.value
  return !!edited && edited.is_draft
})

const slugTouched = ref(false)
const isAutoUpdatingSlug = ref(false)
const isSyncingForm = ref(false)

function getDatePrefix() {
  return new Date().toISOString().slice(0, 10)
}

function getSlugPrefix(slug: string) {
  const match = slug.match(/^\d{4}-\d{2}-\d{2}/)
  return match?.[0] ?? null
}

// When we're editing, make sure the form and edited data are in sync
watch(() => editedDiscussion.value, (item) => {
  if (!item)
    return

  isAutoUpdatingSlug.value = true
  isSyncingForm.value = true

  Object.assign(form, {
    title: item.title ?? '',
    slug: item.slug ?? '',
    description: item.description ?? '',
    markdown: item.markdown ?? '',
    discussion_topic_id: item.discussion_topic_id ?? null,
    is_locked: item.is_locked,
    is_sticky: item.is_sticky,
    is_draft: item.is_draft,
  })

  isAutoUpdatingSlug.value = false
  isSyncingForm.value = false
  slugTouched.value = false
  activeTab.value = 'create'
}, { immediate: true })

watch(() => form.title, (value) => {
  if (isSyncingForm.value) {
    return
  }

  if (!slugTouched.value || !form.slug) {
    const baseSlug = slugify(value)
    const prefix = getSlugPrefix(form.slug) ?? getDatePrefix()
    isAutoUpdatingSlug.value = true
    form.slug = baseSlug ? `${prefix}-${baseSlug}` : ''
  }
})

watch(() => form.slug, () => {
  if (isAutoUpdatingSlug.value) {
    isAutoUpdatingSlug.value = false
    return
  }

  slugTouched.value = true
})

// Preselect a topic if we're currently in a nested view
watch(activeTopicId, (newVal) => {
  if (newVal) {
    form.discussion_topic_id = newVal
  }
}, { immediate: true })

const rules = defineRules<typeof form>({
  title: [required, minLenNoSpace(1), maxLength(128)],
  discussion_topic_id: [required],
})

const loading = ref(false)

const { validate, errors } = useValidation(form, rules, { autoclear: true })

async function submitForm(options: { skipPublishConfirm?: boolean } = {}) {
  if (loading.value)
    return

  if (isPublishingFromDraft.value && !options.skipPublishConfirm) {
    publishConfirmOpen.value = true
    return
  }

  loading.value = true

  try {
    await validate()

    const trimmedSlug = form.slug.trim()
    const resolvedSlug = trimmedSlug ? slugify(trimmedSlug) : null

    if (resolvedSlug) {
      let slugQuery = supabase
        .from('discussions')
        .select('id')
        .eq('slug', resolvedSlug)
        .limit(1)

      if (isEditing.value)
        slugQuery = slugQuery.neq('id', editedDiscussion.value!.id)

      const { data: slugMatches, error: slugError } = await slugQuery

      if (slugError) {
        loading.value = false
        pushToast('Failed to validate slug uniqueness')
        return
      }

      if (slugMatches && slugMatches.length > 0) {
        loading.value = false
        pushToast('Slug is already in use')
        return
      }
    }

    const payload = {
      ...form,
      slug: resolvedSlug,
      ...(isEditing.value && { id: editedDiscussion.value!.id }),
    }

    const { error, data } = await supabase
      .from('discussions')
      .upsert(payload)
      .select()

    loading.value = false

    if (error) {
      pushToast(`Failed to ${isEditing.value ? 'update' : 'create'} discussion`)
      return
    }

    if (payload.is_draft) {
      const existingIndex = drafts.value.findIndex(d => d.id === data[0].id)
      if (existingIndex === -1) {
        drafts.value.push(data[0])
      }
      else {
        drafts.value[existingIndex] = data[0]
      }
      emit('draftUpdated')
    }
    else {
      if (drafts.value.some(d => d.id === data[0].id)) {
        drafts.value = drafts.value.filter(d => d.id !== data[0].id)
        emit('draftUpdated')
      }
      emit('created', data[0])
    }

    emit('close')
    pushToast(`${isEditing.value ? 'Updated' : 'Created'} discussion ${payload.title}${payload.is_draft ? ' (draft)' : ''}`)
  }
  catch {
    loading.value = false
  }
}

// Draft methods
onBeforeMount(() => {
  if (userId.value && !drafts.value.length) {
    supabase
      .from('discussions')
      .select('*')
      .eq('is_draft', true)
      .eq('created_by', userId.value)
      .then(({ data }) => {
        if (data) {
          drafts.value = data
        }
      })
  }
})

function editDraft(draft: Tables<'discussions'>) {
  editingDraft.value = draft
  activeTab.value = 'create'
}

function deleteDraft() {
  if (!deleteConfirm.value)
    return

  deleteLoading.value = true

  supabase
    .from('discussions')
    .delete()
    .eq('id', deleteConfirm.value)
    .then(({ error }) => {
      deleteLoading.value = true

      if (error) {
        pushToast('Failed to delete draft')
        return
      }

      drafts.value = drafts.value.filter(d => d.id !== deleteConfirm.value)
      pushToast('Draft deleted')
      emit('draftUpdated')

      // Switch back to create tab
      if (drafts.value.length === 0) {
        activeTab.value = 'create'
      }
    })
}

// Clear form when modal is closed
watch(() => props.open, (isOpen) => {
  if (!isOpen) {
    Object.assign(form, {
      title: '',
      slug: '',
      description: '',
      markdown: '',
      is_locked: false,
      is_sticky: false,
      is_draft: true,
      discussion_topic_id: null,
    })

    activeTab.value = 'create'
    isAutoUpdatingSlug.value = false
    slugTouched.value = false
    editingDraft.value = null
    publishConfirmOpen.value = false
  }
  else if (editedDiscussion.value) {
    isAutoUpdatingSlug.value = true

    Object.assign(form, {
      title: editedDiscussion.value.title ?? '',
      slug: editedDiscussion.value.slug ?? '',
      description: editedDiscussion.value.description ?? '',
      markdown: editedDiscussion.value.markdown ?? '',
      discussion_topic_id: editedDiscussion.value.discussion_topic_id ?? null,
      is_locked: editedDiscussion.value.is_locked,
      is_sticky: editedDiscussion.value.is_sticky,
      is_draft: editedDiscussion.value.is_draft,
    })

    isAutoUpdatingSlug.value = false
    slugTouched.value = false
    activeTab.value = 'create'
  }
})

function confirmPublish() {
  publishConfirmOpen.value = false
  void submitForm({ skipPublishConfirm: true })
}
</script>

<template>
  <Modal v-bind="props" size="l" :card="{ footerSeparator: true }" @close="emit('close')">
    <template #header>
      <h3>{{ isEditing ? 'Edit' : 'New' }}  discussion</h3>
    </template>
    <p class="mb-l">
      Discussions can be created under a topic. Users will be able to post replies within discussions.
    </p>

    <Tabs v-if="showTabs" v-model="activeTab" variant="filled" expand class="mb-m">
      <Tab value="create">
        Create
      </Tab>
      <Tab value="drafts" :disabled="drafts.length === 0">
        Drafts
        <div v-if="drafts.length > 0" class="counter">
          {{ drafts.length }}
        </div>
      </Tab>
    </Tabs>

    <Flex v-if="activeTab === 'create' || !showTabs" column gap="m">
      <div class="w-100">
        <label class="vui-label required">Topic</label>
        <Dropdown expand>
          <template #trigger="{ toggle, isOpen }">
            <Button expand class="w-100" outline @click="toggle">
              <template #start>
                <span class="text-size-m">
                  {{ topicOptions.find(o => o.id === form.discussion_topic_id)?.label || 'Select parent topic' }}
                </span>
              </template>
              <template #end>
                <Icon :name="isOpen ? 'ph:caret-up' : 'ph:caret-down'" :size="16" />
              </template>
            </Button>
          </template>
          <template #default="{ close }">
            <DropdownTitle>
              <Input v-model="search" placeholder="Search topics..." expand focus />
            </DropdownTitle>
            <Flex column gap="xxs">
              <button v-for="option in topicOptions" :key="option.id" :label="option.label" expand class="form-add-discussion__button" @click="form.discussion_topic_id = option.id, close()">
                <span>{{ option.label }}</span>
                <p v-if="option.path" class="font-size-xs">
                  {{ option.path }}
                </p>
              </button>
            </Flex>
            <p v-if="topicOptions.length === 0">
              No options found.
            </p>
          </template>
        </Dropdown>

        <ul v-if="errors.discussion_topic_id.invalid" class="vui-input-errors">
          <li>A topic is required</li>
        </ul>
      </div>
      <Input v-model="form.title" :errors="normalizeErrors(errors.title)" label="Name" expand placeholder="What is this discussion about?" required />
      <Input v-model="form.slug" :errors="normalizeErrors(errors.slug)" label="Slug (optional)" expand placeholder="Auto-generated from the title" />
      <Input v-model="form.description" :errors="normalizeErrors(errors.description)" label="Description" expand placeholder="Short summary for the discussion" />
      <RichTextEditor
        v-model="form.markdown"
        :errors="normalizeErrors(errors.markdown)"
        :media-context="editedDiscussion && userId ? `${editedDiscussion.id}/${userId}` : 'staging'"
        :media-bucket-id="FORUMS_BUCKET_ID"
        min-height="196px"
        hint="You can use markdown and added media through drag-and-drop"
        label="Content"
        placeholder="Add more context to the discussion"
      />

      <Card class="card-bg">
        <Grid :columns="(isMobile || (!editedDiscussion?.is_draft && editedDiscussion)) ? 2 : 3" gap="m">
          <Tooltip :disabled="!showDraftTooltip">
            <Switch v-if="!editedDiscussion || editedDiscussion.is_draft" v-model="form.is_draft" label="Draft" />
            <template #tooltip>
              <p>Publishing a discussion cannot be undone</p>
            </template>
          </Tooltip>
          <Switch v-model="form.is_locked" label="Locked" />
          <Switch v-model="form.is_sticky" label="Sticky" />
        </Grid>
      </Card>
    </Flex>

    <template v-else-if="showTabs">
      <strong class="mb-s text-l block font-bold">Drafts</strong>
      <Flex column gap="s">
        <Card v-for="draft of drafts" :key="draft.id" class="card-bg draft-item" style="cursor: pointer;" @click="router.push(`/forum/${draft.slug ?? draft.id}`)">
          <Flex x-between y-center>
            <div>
              <strong class="font-weight-bold">{{ draft.title }}</strong>
              <p class="text-color-lighter">
                {{ draft.description }}
              </p>
            </div>
            <ButtonGroup :gap="1">
              <Button size="s" @click.stop="editDraft(draft)">
                Edit
              </Button>
              <Button square size="s" :loading="deleteLoading" @click.stop="deleteConfirm = draft.id">
                <Icon name="ph:trash" />
              </Button>
            </ButtonGroup>
          </Flex>
        </Card>
      </Flex>
    </template>

    <template #footer>
      <Flex gap="s" x-end>
        <Button plain @click="emit('close')">
          Cancel
        </Button>
        <Button v-if="activeTab === 'create' || !showTabs" variant="accent" :loading="loading" @click="submitForm">
          {{ isEditing ? 'Save' : 'Create' }}
        </Button>
      </Flex>
    </template>
  </Modal>

  <ConfirmModal
    :open="!!deleteConfirm"
    :confirm-loading="deleteLoading"
    title="Remove"
    description="Are you sure you want to delete this draft?"
    @confirm="deleteDraft"
    @cancel="deleteConfirm = null"
  />

  <ConfirmModal
    :open="publishConfirmOpen"
    title="Publish discussion"
    description="Publishing a discussion cannot be undone. Are you sure you want to publish it?"
    @confirm="confirmPublish"
    @cancel="publishConfirmOpen = false"
  />
</template>

<style scoped lang="scss">
.draft-item:hover {
  background-color: var(--color-bg-raised);
}

.form-add-discussion__button {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  padding: var(--space-xs) var(--space-xs);
  align-items: flex-start;
  justify-content: flex-strat;
  border-radius: var(--border-radius-m);

  p {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
  }

  &:hover {
    background-color: var(--color-button-gray-hover);
  }
}

:deep(.vui-dropdown-trigger-wrap) {
  display: block;
  width: 100%;
}
</style>
