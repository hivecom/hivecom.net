<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'

import { defineRules, maxLength, minLenNoSpace, required, useValidation } from '@dolanske/v-valid'
import { Button, ButtonGroup, Card, Dropdown, DropdownTitle, Flex, Grid, Input, Modal, pushToast, searchString, Switch, Tab, Tabs, Tooltip } from '@dolanske/vui'
import { FORUM_KEYS } from '@/components/Forum/Forum.keys'
import { useDataForumTopics } from '@/composables/useDataForumTopics'
import { useDataUser } from '@/composables/useDataUser'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { useDiscussionCache } from '@/composables/useDiscussionCache'
import { useDiscussionSubscriptionsCache } from '@/composables/useDiscussionSubscriptionsCache'
import { useBreakpoint } from '@/lib/mediaQuery'
import { FORUMS_BUCKET_ID } from '@/lib/storageAssets'
import { flattenTopicsTree } from '@/lib/topics'
import { normalizeErrors, slugify } from '@/lib/utils/formatting'
import RichTextEditor from '../Editor/RichTextEditor.vue'
import ConfirmModal from '../Shared/ConfirmModal.vue'
import TinyBadge from '../Shared/TinyBadge.vue'

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', discussion: Tables<'discussions'>): void
  (e: 'draftUpdated'): void
  (e: 'deleted', discussionId: string): void
}>()

interface Props {
  open: boolean
  editedItem?: Tables<'discussions'>
  drafts?: Tables<'discussions'>[]
  hideTabs?: boolean
  defaultTopicId?: string | null
  startOnDrafts?: boolean
}

const isMobile = useBreakpoint('<s')

const supabase = useSupabaseClient()
const userId = useUserId()
const discussionCache = useDiscussionCache()
const subscriptionsCache = useDiscussionSubscriptionsCache()

// Use the cached user data composable - role is already fetched and shared
// with ForumItemActions and the parent page. No extra DB queries needed.
const { user: cachedUser } = useDataUser(userId, { includeRole: true })

// discussions.update is granted to admin and moderator only.
const canUpdateDiscussions = computed(() =>
  cachedUser.value?.role === 'admin' || cachedUser.value?.role === 'moderator',
)

const { settings } = useDataUserSettings()

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
const deleteDiscussionLoading = ref(false)
const deleteDiscussionConfirm = ref(false)

const isLinkedDiscussion = computed(() => {
  const d = editedDiscussion.value
  if (!d)
    return false
  return Boolean(
    d.event_id
    || d.gameserver_id
    || d.project_id
    || d.profile_id
    || d.referendum_id,
  )
})

watch(() => props.editedItem, (item) => {
  if (item) {
    editingDraft.value = null
  }
})

// Inject provided values from parent
const injectedTopics = inject(FORUM_KEYS.forumTopics, () => ref<Tables<'discussion_topics'>[]>([]))()
const activeTopicId = inject(FORUM_KEYS.forumActiveTopicId, () => ref<string | null>(null))()

// Fall back to shared cached topics when the parent forum page hasn't provided them via inject
const { topics: cachedTopics } = useDataForumTopics()
const resolvedTopics = computed(() =>
  injectedTopics.value.length ? injectedTopics.value : cachedTopics.value,
)

// Options to optionally select a parent topic. A 1-level deep list which
// contains paths to possibly deeply nested topics
const topicOptions = computed(() => {
  // Topics that are always included regardless of lock/archive (e.g. the one
  // already assigned to the discussion being edited).
  const pinnedId = editedDiscussion.value?.discussion_topic_id

  return flattenTopicsTree(
    resolvedTopics.value.filter(item =>
      item.id === pinnedId || (
        (settings.value.show_forum_archived || !item.is_archived)
        && (canUpdateDiscussions.value || !item.is_locked)
      ),
    ),
  )
    .filter(({ topic, path }) => search.value ? searchString([topic.name, path], search.value) : true)
    .map(({ topic, depth, path }) => ({
      id: topic.id,
      label: topic.name,
      parent_id: topic.id,
      path,
      depth,
    }))
})

const form = reactive<{
  title: string
  slug: string
  description: string
  markdown: string
  is_locked: boolean
  is_sticky: boolean
  is_draft: boolean
  is_nsfw: boolean
  discussion_topic_id: string | null
}>({
  title: '',
  slug: '',
  description: '',
  markdown: '',
  is_locked: false,
  is_sticky: false,
  is_draft: true,
  is_nsfw: false,
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

const SLUG_DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}/

function getDatePrefix() {
  return new Date().toISOString().slice(0, 10)
}

function getSlugPrefix(slug: string) {
  const match = slug.match(SLUG_DATE_PREFIX_RE)
  return match?.[0] ?? null
}

// When we're editing, make sure the form and edited data are in sync
watch(() => editedDiscussion.value, async (item) => {
  if (!item)
    return

  Object.assign(form, {
    title: item.title ?? '',
    slug: item.slug ?? '',
    description: item.description ?? '',
    markdown: item.markdown ?? '',
    discussion_topic_id: item.discussion_topic_id ?? null,
    is_locked: item.is_locked,
    is_sticky: item.is_sticky,
    is_draft: item.is_draft,
    is_nsfw: item.is_nsfw ?? false,
  })

  // Wait for Vue to flush watchers triggered by the Object.assign above before
  // resetting slugTouched - otherwise the slug watcher fires async and stamps
  // slugTouched = true after we clear it here.
  await nextTick()
  slugTouched.value = false
  activeTab.value = 'create'
}, { immediate: true })

function buildAutoSlug(title: string) {
  const baseSlug = slugify(title)
  if (!baseSlug)
    return ''
  const topicSlug = form.discussion_topic_id
    ? (resolvedTopics.value.find(t => t.id === form.discussion_topic_id)?.slug ?? null)
    : null
  const datePrefix = getSlugPrefix(form.slug) ?? getDatePrefix()
  const parts = [datePrefix, topicSlug, baseSlug].filter(Boolean)
  return parts.join('-')
}

watch(() => form.title, (value) => {
  if (!slugTouched.value || !form.slug) {
    isAutoUpdatingSlug.value = true
    form.slug = buildAutoSlug(value)
  }
})

watch(() => form.discussion_topic_id, () => {
  if (!slugTouched.value) {
    isAutoUpdatingSlug.value = true
    form.slug = buildAutoSlug(form.title)
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

    pushToast(`${isEditing.value ? 'Updated' : 'Created'} discussion ${payload.title}${payload.is_draft ? ' (draft)' : ''}`)

    if (!isEditing.value && userId.value)
      subscriptionsCache.invalidateList(userId.value)

    // Invalidate the old cache entry before writing the new one so stale slug
    // and id keys don't survive a title/slug/topic change.
    if (isEditing.value && editedDiscussion.value) {
      discussionCache.invalidate(editedDiscussion.value.id, editedDiscussion.value.slug)
    }
    // Warm the cache with the freshly saved row.
    discussionCache.set(data[0])

    if (payload.is_draft) {
      const existingIndex = drafts.value.findIndex(d => d.id === data[0].id)
      if (existingIndex === -1) {
        drafts.value.push(data[0])
      }
      else {
        drafts.value[existingIndex] = data[0]
      }
      emit('draftUpdated')

      // Redirect to the draft page - deferred so the modal teardown completes first
      await nextTick()
      await navigateTo(`/forum/${data[0].slug ?? data[0].id}`)
    }
    else {
      if (drafts.value.some(d => d.id === data[0].id)) {
        drafts.value = drafts.value.filter(d => d.id !== data[0].id)
        emit('draftUpdated')
      }
      // Capture old identifier now - emitting 'created' propagates the new data
      // back up through the parent chain reactively, so editedDiscussion.value
      // will already reflect the new slug by the time we check after nextTick.
      const oldIdentifier = isEditing.value && editedDiscussion.value
        ? (editedDiscussion.value.slug ?? editedDiscussion.value.id)
        : null
      emit('created', data[0])
      emit('close')
      // Defer navigation until after the modal has had a tick to tear down.
      // Navigating synchronously while the modal is still mounted causes a
      // null-node unmount crash in Vue's patch cycle.
      await nextTick()
      // Navigate to the new slug when editing and the slug changed, or to the
      // newly published discussion when creating.
      if (oldIdentifier !== null) {
        const newIdentifier = data[0].slug ?? data[0].id
        if (oldIdentifier !== newIdentifier) {
          await navigateTo(`/forum/${newIdentifier}`)
        }
      }
      else {
        await navigateTo(`/forum/${data[0].slug ?? data[0].id}`)
      }
    }
  }
  catch {
    loading.value = false
  }
}

// Draft methods - load lazily on first open rather than on every mount.
// ForumModalAddDiscussion is always mounted on the forum page (no v-if), so
// onBeforeMount would fire on every page render. Deferring to first open
// eliminates the spurious draft fetch for users who never open the modal.
// Pre-select topic when opened from a topic's action menu
watch(() => props.open, (open) => {
  if (open && !isEditing.value && props.defaultTopicId) {
    form.discussion_topic_id = props.defaultTopicId
  }
}, { immediate: true })

const draftsLoaded = ref(false)

watch(() => props.open, (isOpen) => {
  if (!isOpen || !userId.value)
    return

  if (props.startOnDrafts && showTabs.value)
    activeTab.value = 'drafts'

  if (draftsLoaded.value)
    return

  draftsLoaded.value = true

  supabase
    .from('discussions')
    .select('*')
    .eq('is_draft', true)
    .eq('created_by', userId.value)
    .then(({ data }) => {
      if (data)
        drafts.value = data
    })
})

function editDraft(draft: Tables<'discussions'>) {
  editingDraft.value = draft
  activeTab.value = 'create'
}

async function deleteDiscussion() {
  if (!editedDiscussion.value)
    return

  deleteDiscussionLoading.value = true

  try {
    const { error } = await supabase
      .from('discussions')
      .delete()
      .eq('id', editedDiscussion.value.id)

    if (error)
      throw error

    discussionCache.invalidate(editedDiscussion.value.id, editedDiscussion.value.slug)
    emit('deleted', editedDiscussion.value.id)
    emit('close')
  }
  catch {
    pushToast('Failed to delete discussion')
  }
  finally {
    deleteDiscussionLoading.value = false
    deleteDiscussionConfirm.value = false
  }
}

function deleteDraft() {
  if (!deleteConfirm.value)
    return

  const draftId = deleteConfirm.value
  deleteLoading.value = true

  supabase
    .from('discussions')
    .delete()
    .eq('id', draftId)
    .then(({ error }) => {
      deleteLoading.value = false

      if (error) {
        pushToast('Failed to delete draft')
        return
      }

      const cachedDraft = discussionCache.getById(draftId)
      discussionCache.invalidate(draftId, cachedDraft?.slug)
      drafts.value = drafts.value.filter(d => d.id !== draftId)
      pushToast('Draft deleted')
      emit('draftUpdated')

      // Switch back to create tab
      if (drafts.value.length === 0) {
        activeTab.value = 'create'
      }
    })
}

// Clear form when modal is closed, repopulate when it re-opens.
// The editedDiscussion watcher only fires on value *changes* - if the same
// object reference is passed on re-open (e.g. after a save that didn't change
// the prop reference), the watcher won't re-fire and the form stays blank.
// Watching props.open and repopulating on open covers that case.
watch(() => props.open, async (isOpen) => {
  if (!isOpen) {
    Object.assign(form, {
      title: '',
      slug: '',
      description: '',
      markdown: '',
      is_locked: false,
      is_sticky: false,
      is_draft: true,
      is_nsfw: false,
      discussion_topic_id: null,
    })

    activeTab.value = 'create'
    isAutoUpdatingSlug.value = false
    editingDraft.value = null
    publishConfirmOpen.value = false
    // nextTick so the slug watcher flush from clearing form.slug doesn't set slugTouched
    await nextTick()
    slugTouched.value = false
  }
  else if (editedDiscussion.value) {
    // Re-opening with an existing editedItem - force repopulate in case the
    // object reference hasn't changed and the editedDiscussion watcher didn't fire.
    const item = editedDiscussion.value
    Object.assign(form, {
      title: item.title ?? '',
      slug: item.slug ?? '',
      description: item.description ?? '',
      markdown: item.markdown ?? '',
      discussion_topic_id: item.discussion_topic_id ?? null,
      is_locked: item.is_locked,
      is_sticky: item.is_sticky,
      is_draft: item.is_draft,
      is_nsfw: item.is_nsfw ?? false,
    })
    await nextTick()
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
  <Modal v-bind="props" size="l" :card="{ footerSeparator: true }" :can-dismiss="false" @close="emit('close')" @keydown.ctrl.enter.prevent="submitForm()" @keydown.meta.enter.prevent="submitForm()">
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
        <Flex y-center gap="xs">
          Drafts
          <TinyBadge v-if="drafts.length > 0" variant="info">
            {{ drafts.length }}
          </TinyBadge>
        </Flex>
      </Tab>
    </Tabs>

    <Flex v-if="activeTab === 'create' || !showTabs" column gap="m">
      <div class="w-100 topic-dropdown">
        <label class="vui-label required">Topic</label>
        <Dropdown expand>
          <template #trigger="{ toggle, isOpen }">
            <Button expand class="w-100 vui-button-select" outline @click="toggle">
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
              <button
                v-for="option in topicOptions"
                :key="option.id"
                :label="option.label"
                expand
                class="form-add-discussion__button"
                :style="option.depth > 0 ? { paddingLeft: `calc(var(--space-xs) + ${option.depth * 16}px)` } : undefined"
                @click="form.discussion_topic_id = option.parent_id, close()"
              >
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
      <Input v-model="form.slug" :errors="normalizeErrors(errors.slug)" label="URL slug (optional)" expand placeholder="e.g. my-discussion-title" hint="A custom URL-friendly identifier for this discussion. Leave blank to generate one automatically." />
      <Input v-model="form.description" :errors="normalizeErrors(errors.description)" label="Description / Subtitle" expand placeholder="Short summary for the discussion" hint="" />
      <RichTextEditor
        v-model="form.markdown"
        :errors="normalizeErrors(errors.markdown)"
        :media-context="editedDiscussion && userId ? `${editedDiscussion.id}/${userId}` : 'staging'"
        :media-bucket-id="FORUMS_BUCKET_ID"
        min-height="196px"
        max-height="33vh"
        hint="You can use markdown and add media by drag-and-drop"
        label="Content"
        placeholder="This is the main body of your discussion"
        show-attachment-button
        show-expand-button
      />

      <Card class="card-bg">
        <Grid :columns="isMobile ? 2 : ((!editedDiscussion?.is_draft && editedDiscussion) ? 3 : 4)" gap="m">
          <Tooltip :disabled="!showDraftTooltip">
            <Switch v-if="!editedDiscussion || editedDiscussion.is_draft" v-model="form.is_draft" label="Draft" />
            <template #tooltip>
              <p>Publishing a discussion cannot be undone</p>
            </template>
          </Tooltip>
          <Switch v-model="form.is_locked" label="Locked" />
          <Switch v-model="form.is_sticky" label="Sticky" />
          <Switch v-model="form.is_nsfw" label="NSFW" />
        </Grid>
      </Card>
    </Flex>

    <template v-else-if="showTabs">
      <strong class="mb-s text-l block font-bold">Drafts</strong>
      <Flex column gap="s">
        <Card v-for="draft of drafts" :key="draft.id" class="card-bg draft-item" style="cursor: pointer;" @click="navigateTo(`/forum/${draft.slug ?? draft.id}`)">
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
      <Flex gap="xs" x-between expand>
        <Flex gap="xs">
          <Tooltip v-if="isEditing && canUpdateDiscussions">
            <Button
              variant="danger"
              square
              :disabled="isLinkedDiscussion"
              :loading="deleteDiscussionLoading"
              @click="deleteDiscussionConfirm = true"
            >
              <Icon name="ph:trash" />
            </Button>
            <template #tooltip>
              <p>{{ isLinkedDiscussion ? 'This discussion is linked to an entity and cannot be deleted.' : 'Delete discussion' }}</p>
            </template>
          </Tooltip>
        </Flex>

        <Flex gap="xs">
          <Button plain @click="emit('close')">
            Cancel
          </Button>
          <Button v-if="activeTab === 'create' || !showTabs" variant="accent" :loading="loading" @click="submitForm">
            {{ isEditing ? 'Save changes' : 'Create' }}
          </Button>
        </Flex>
      </Flex>
    </template>
  </Modal>

  <ConfirmModal
    v-if="isEditing && editedDiscussion != null"
    v-model:open="deleteDiscussionConfirm"
    :confirm-loading="deleteDiscussionLoading"
    title="Delete discussion"
    :description="`Are you sure you want to delete '${editedDiscussion?.title}'? This cannot be undone.`"
    confirm-text="Delete"
    :destructive="true"
    @confirm="deleteDiscussion"
  />

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

.topic-dropdown :deep(.vui-dropdown-trigger-wrap) {
  display: block;
  width: 100%;
}
</style>
