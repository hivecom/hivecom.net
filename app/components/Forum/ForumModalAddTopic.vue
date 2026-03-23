<script setup lang="ts">
import type { RefreshTopicIconFn } from '@/components/Forum/Forum.keys'
import type { TopicWithDiscussions } from '@/pages/forum/index.vue'
import type { Tables } from '@/types/database.overrides'
import { defineRules, maxLength, minLenNoSpace, required, useValidation } from '@dolanske/v-valid'
import { Button, Card, Dropdown, DropdownTitle, Flex, Input, Modal, pushToast, searchString, Switch } from '@dolanske/vui'
import { FORUM_KEYS } from '@/components/Forum/Forum.keys'
import FileUpload from '@/components/Shared/FileUpload.vue'
import { invalidateTopicIconMemoryCache } from '@/composables/useTopicIcon'
import { deleteTopicIcon, getTopicIconUrl, invalidateTopicIconCache, uploadTopicIcon } from '@/lib/storage'
import { composedPathToString, composePathToTopic } from '@/lib/topics'
import { normalizeErrors, slugify } from '@/lib/utils/formatting'

interface Props {
  open: boolean
  editedItem?: Tables<'discussion_topics'>
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', topic: TopicWithDiscussions): void
}>()

const supabase = useSupabaseClient()
const search = ref('')
const isEditing = computed(() => !!props.editedItem)

// Inject provided values from parent
const topics = inject(FORUM_KEYS.forumTopics, () => ref([]))()
const activeTopicId = inject(FORUM_KEYS.forumActiveTopicId, () => ref(null))()
const refreshTopicIcon = inject<RefreshTopicIconFn>(FORUM_KEYS.forumRefreshTopicIcon)

// Collect all descendant IDs of a topic (including itself) so they can be
// excluded from the location dropdown - a topic can't be placed inside itself
// or any of its own children.
function getDescendantIds(rootId: string, allTopics: typeof topics.value): Set<string> {
  const ids = new Set<string>()
  const queue = [rootId]
  while (queue.length > 0) {
    const current = queue.shift()!
    ids.add(current)
    for (const t of allTopics) {
      if (t.parent_id === current)
        queue.push(t.id)
    }
  }
  return ids
}

// Options to optionally select a parent topic. A 1-level deep list which
// contains paths to possibly deeply nested topics
const topicOptions = computed(() => {
  const excludedIds = isEditing.value && props.editedItem
    ? getDescendantIds(props.editedItem.id, topics.value)
    : new Set<string>()

  return [
    { id: '-', label: 'Top-level', parent_id: null, path: '/', priority: 0 },
    ...topics.value
      .filter(item => !item.is_archived && !excludedIds.has(item.id))
      .map(topic => ({
        id: topic.id,
        label: topic.name,
        parent_id: topic.id,
        path: composedPathToString(composePathToTopic(topic.id, topics.value)),
      }))
      .filter(topic => search.value ? searchString([topic.label, topic.path], search.value) : true),
  ]
})

// Form validation
const form = reactive({
  name: '',
  slug: '',
  description: '',
  parent_id: null as string | null,
  is_locked: false,
  priority: 0,
})

const slugTouched = ref(false)
const isAutoUpdatingSlug = ref(false)

// ── Topic icon state ──────────────────────────────────────────────────────────
const iconUrl = ref<string | null>(null)
const iconUploading = ref(false)
const iconDeleting = ref(false)
const iconError = ref<string | null>(null)

// When editing, fetch the existing topic icon
watch(() => props.editedItem, async (item) => {
  iconUrl.value = null
  iconError.value = null

  if (!item)
    return

  try {
    iconUrl.value = await getTopicIconUrl(supabase, item.id)
  }
  catch {
    // No icon or fetch failed - that's fine
  }
}, { immediate: true })

async function handleIconUpload(file: File) {
  if (!isEditing.value || !props.editedItem) {
    pushToast('Save the topic first, then add an icon')
    return
  }

  iconUploading.value = true
  iconError.value = null

  try {
    const result = await uploadTopicIcon(supabase, props.editedItem.id, file)

    if (result.success && result.url) {
      iconUrl.value = result.url
      // Bust both caches and refresh the forum list's bulk icon map
      invalidateTopicIconCache(props.editedItem.id)
      invalidateTopicIconMemoryCache(props.editedItem.id)
      void refreshTopicIcon?.(props.editedItem.id)
      pushToast('Topic icon uploaded')
    }
    else {
      iconError.value = result.error ?? 'Failed to upload icon'
    }
  }
  catch {
    iconError.value = 'An unexpected error occurred'
  }
  finally {
    iconUploading.value = false
  }
}

function handleIconRemove() {
  iconUrl.value = null
  iconError.value = null
}

async function handleIconDelete() {
  if (!props.editedItem)
    return

  iconDeleting.value = true
  iconError.value = null

  try {
    const result = await deleteTopicIcon(supabase, props.editedItem.id)

    if (result.success) {
      iconUrl.value = null
      invalidateTopicIconCache(props.editedItem.id)
      invalidateTopicIconMemoryCache(props.editedItem.id)
      void refreshTopicIcon?.(props.editedItem.id)
      pushToast('Topic icon deleted')
    }
    else {
      iconError.value = result.error ?? 'Failed to delete icon'
    }
  }
  catch {
    iconError.value = 'An unexpected error occurred'
  }
  finally {
    iconDeleting.value = false
  }
}

// When we're editing, make sure the form and edited data are in sync
watch(() => props.editedItem, (item) => {
  if (!item)
    return

  isAutoUpdatingSlug.value = true

  Object.assign(form, {
    name: item.name,
    slug: item.slug ?? '',
    description: item.description ?? '',
    parent_id: item.parent_id,
    is_locked: item.is_locked,
    priority: item.priority,
  })

  isAutoUpdatingSlug.value = false
  slugTouched.value = false
}, { immediate: true })

watch(() => form.name, (value) => {
  if (!slugTouched.value || !form.slug) {
    isAutoUpdatingSlug.value = true
    form.slug = slugify(value)
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
    form.parent_id = newVal
  }
}, { immediate: true })

const rules = defineRules<typeof form>({
  name: [required, minLenNoSpace(1), maxLength(128)],
  priority: [required],
})

const loading = ref(false)

const { validate, errors } = useValidation(form, rules, { autoclear: true })

async function submitForm() {
  if (loading.value)
    return

  loading.value = true

  if (isEditing.value && form.parent_id === props.editedItem?.id) {
    pushToast('Topic cannot be its own parent')
    loading.value = false
    return
  }

  try {
    await validate()

    const trimmedSlug = form.slug.trim()
    const resolvedSlug = trimmedSlug ? slugify(trimmedSlug) : slugify(form.name)

    let slugQuery = supabase
      .from('discussion_topics')
      .select('id')
      .eq('slug', resolvedSlug)
      .limit(1)

    if (isEditing.value)
      slugQuery = slugQuery.neq('id', props.editedItem!.id)

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

    const payload = {
      ...form,
      slug: resolvedSlug,
      ...(isEditing.value && { id: props.editedItem!.id }),
    }

    const { error, data } = await supabase
      .from('discussion_topics')
      .upsert(payload)
      .select()

    loading.value = false

    if (error) {
      pushToast(`Failed to ${isEditing.value ? 'update' : 'create'} topic`)
      return
    }

    emit('created', { ...data[0], discussions: [] })
    emit('close')
    pushToast(`${isEditing.value ? 'Updated' : 'Created'} topic ${payload.name}`)
  }
  catch {
    loading.value = false
  }
}
</script>

<template>
  <Modal v-bind="props" size="s" :card="{ footerSeparator: true }" @close="emit('close')">
    <template #header>
      <h3>{{ isEditing ? 'Edit' : 'Create' }} topic</h3>
    </template>
    <p class="mb-l">
      Topics are top level categories in which you can create discussions. You can also nest topics within topics.
    </p>

    <Flex column gap="m">
      <Input v-model="form.name" :errors="normalizeErrors(errors.name)" label="Name" expand placeholder="Topic title" required />
      <Input v-model="form.slug" :errors="normalizeErrors(errors.slug)" label="Slug (optional)" expand placeholder="Auto-generated from the name" />
      <Input v-model="form.description" :errors="normalizeErrors(errors.description)" label="Description" expand placeholder="Simply describe the topic" />
      <Input v-model="form.priority" :errors="normalizeErrors(errors.priority)" type="number" label="Priority" expand placeholder="Set the topic priority for the sort order" />

      <div class="w-100">
        <label class="vui-label">Location</label>
        <Dropdown expand>
          <template #trigger="{ toggle, isOpen }">
            <Button expand class="w-100 vui-button-select" :loading="loading" outline @click="toggle">
              <template #start>
                <span class="text-size-m">
                  {{ form.parent_id === null ? 'Top-level' : topicOptions.find(o => o.parent_id === form.parent_id)?.label || 'Select parent topic' }}
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
              <button v-for="option in topicOptions" :key="option.id" :label="option.label" expand class="form-add-topic__button" @click="form.parent_id = option.parent_id, close()">
                <span>{{ option.label }}</span>
                <p v-if="option.path" class="font-size-xs">
                  {{ option.path }}
                </p>
              </button>
            </Flex>
          </template>
        </Dropdown>
      </div>

      <!-- Topic icon upload - only available when editing an existing topic -->
      <Flex v-if="isEditing" y-start :gap="0" x-between expand>
        <Flex column :gap="0">
          <label class="vui-label">Topic Icon</label>
          <p class="form-add-topic__icon-hint">
            Shown as a background on the topic.
          </p>
        </Flex>
        <FileUpload
          label="Topic Icon"
          variant="icon"
          :max-height="42"
          :preview-url="iconUrl"
          :loading="iconUploading"
          :error="iconError"
          :show-delete="!!iconUrl"
          :deleting="iconDeleting"
          @upload="handleIconUpload"
          @remove="handleIconRemove"
          @delete="handleIconDelete"
        />
      </Flex>
      <p v-else class="form-add-topic__icon-note">
        You can add a topic icon after creating the topic.
      </p>

      <Card class="card-bg">
        <Switch v-model="form.is_locked" label="Locked" />
      </Card>
    </Flex>

    <template #footer>
      <Flex gap="s" x-end>
        <Button plain @click="emit('close')">
          Cancel
        </Button>
        <Button variant="accent" @click="submitForm">
          {{ isEditing ? 'Save' : 'Create' }}
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style scoped lang="scss">
.form-add-topic__button {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  padding: var(--space-xs) var(--space-xs);
  align-items: flex-start;
  justify-content: flex-start;
  border-radius: var(--border-radius-m);

  p {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
  }

  &:hover {
    background-color: var(--color-button-gray-hover);
  }
}

.form-add-topic__icon-hint {
  font-size: var(--font-size-s);
  color: var(--color-text-lighter);
  margin-bottom: var(--space-s);
}

.form-add-topic__icon-note {
  font-size: var(--font-size-s);
  color: var(--color-text-lighter);
  font-style: italic;
}

:deep(.vui-dropdown-trigger-wrap) {
  display: block;
  width: 100%;
}
</style>
