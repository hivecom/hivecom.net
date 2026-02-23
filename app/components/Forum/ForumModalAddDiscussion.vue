<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { defineRules, maxLength, minLenNoSpace, required, useValidation } from '@dolanske/v-valid'
import { Button, ButtonGroup, Card, Dropdown, DropdownTitle, Flex, Grid, Input, Modal, pushToast, searchString, Switch, Tab, Tabs } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'
import { composedPathToString, composePathToTopic } from '@/lib/topics'
import { normalizeErrors, slugify } from '@/lib/utils/formatting'
import RichTextEditor from '../Editor/RichTextEditor.vue'

interface Props {
  open: boolean
  editedItem?: Tables<'discussions'>
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', discussion: Tables<'discussions'>): void
}>()

const isMobile = useBreakpoint('<s')

const supabase = useSupabaseClient()
const search = ref('')
const isEditing = computed(() => !!props.editedItem)

// Inject provided values from parent
const topics = inject<() => Ref<Tables<'discussion_topics'>[]>>('forumTopics', () => ref([]))()
const activeTopicId = inject<() => Ref<string | null>>('forumActiveTopicId', () => ref(null))()

// Options to optionally select a parent topic. A 1-level deep list which
// contains paths to possibly deeply nested topics
const topicOptions = computed(() => {
  return topics.value
    .filter(item => !item.is_archived && !item.is_locked)
    .map(topic => ({
      id: topic.id,
      label: topic.name,
      parent_id: topic.id,
      path: composedPathToString(composePathToTopic(topic.id, topics.value)),
    }))
    .filter(topic => search.value ? searchString([topic.label, topic.path], search.value) : true)
})

const form = reactive({
  title: '',
  slug: '',
  description: '',
  markdown: '',
  is_locked: false,
  is_sticky: false,
  is_draft: false,
  discussion_topic_id: '',
})

const slugTouched = ref(false)
const isAutoUpdatingSlug = ref(false)

// When we're editing, make sure the form and edited data are in sync
watch(() => props.editedItem, (item) => {
  if (!item)
    return

  isAutoUpdatingSlug.value = true

  Object.assign(form, {
    title: item.title ?? '',
    slug: item.slug ?? '',
    description: item.description ?? '',
    markdown: item.markdown ?? '',
    discussion_topic_id: item.discussion_topic_id ?? '',
    is_locked: item.is_locked,
    is_sticky: item.is_sticky,
  })

  isAutoUpdatingSlug.value = false
  slugTouched.value = false
}, { immediate: true })

watch(() => form.title, (value) => {
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
    form.discussion_topic_id = newVal
  }
}, { immediate: true })

const rules = defineRules<typeof form>({
  title: [required, minLenNoSpace(1), maxLength(128)],
  discussion_topic_id: [required],
})

const loading = ref(false)

const { validate, errors } = useValidation(form, rules, { autoclear: true })

async function submitForm() {
  if (loading.value)
    return

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
    }

    const payload = {
      ...form,
      slug: resolvedSlug,
      ...(isEditing.value && { id: props.editedItem!.id }),
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

    emit('created', data[0])
    emit('close')
    pushToast(`${isEditing.value ? 'Updated' : 'Created'} discussion ${payload.title}`)
  }
  catch {
    loading.value = false
  }
}

// Drafts

const activeTab = ref<'create' | 'drafts'>('create')
</script>

<template>
  <Modal v-bind="props" size="l" :card="{ footerSeparator: true }" @close="emit('close')">
    <template #header>
      <h3>{{ isEditing ? 'Edit' : 'New' }}  discussion</h3>
    </template>
    <p class="mb-l">
      Discussions can be created under a topic. Users will be able to post replies within discussions.
    </p>

    <Tabs v-model="activeTab" variant="filled" expand class="mb-m">
      <Tab value="create">
        Create
      </Tab>
      <Tab value="drafts">
        Drafts
        <div class="counter">
          3
        </div>
      </Tab>
    </Tabs>

    <Flex v-if="activeTab === 'create'" column gap="m">
      <Input v-model="form.title" :errors="normalizeErrors(errors.title)" label="Name" expand placeholder="What is this discussion about?" required />
      <Input v-model="form.slug" :errors="normalizeErrors(errors.slug)" label="Slug (optional)" expand placeholder="Auto-generated from the title" />
      <Input v-model="form.description" :errors="normalizeErrors(errors.description)" label="Description" expand placeholder="Short summary for the discussion" />
      <RichTextEditor
        v-model="form.markdown"
        :errors="normalizeErrors(errors.markdown)"
        :media-context="props.editedItem ? props.editedItem.id : 'staging'"
        min-height="196px"
        hint="You can use markdown"
        label="Content"
        placeholder="Add more context to the discussion"
      />

      <div class="w-100">
        <label class="vui-label">Topic</label>
        <Dropdown expand>
          <template #trigger="{ toggle, isOpen }">
            <Button expand class="w-100" :loading="loading" outline @click="toggle">
              <template #start>
                <span class="text-size-m">
                  {{ form.discussion_topic_id === null ? 'Top-level' : topicOptions.find(o => o.id === form.discussion_topic_id)?.label || 'Select parent topic' }}
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
      </div>

      <Card class="card-bg">
        <Grid :columns="isMobile ? 2 : 3" gap="m">
          <Switch v-model="form.is_draft" label="Draft" />
          <Switch v-model="form.is_locked" label="Locked" />
          <Switch v-model="form.is_sticky" label="Sticky" />
        </Grid>
      </Card>
    </Flex>

    <template v-else>
      <strong class="mb-s text-l block font-bold">Drafts</strong>
      <Flex coolumn gap="s">
        <Card class="card-bg">
          <Flex x-between y-center>
            <div>
              <strong class="font-weight-bold">New burger just dropped</strong>
              <p class="text-color-lighter">
                What do you think of the new Katy Perry burger?
              </p>
            </div>
            <ButtonGroup :gap="1">
              <Button size="s">
                Edit
              </Button>
              <Button square size="s">
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
        <Button v-if="activeTab === 'create'" variant="accent" :loading="loading" @click="submitForm">
          {{ isEditing ? 'Save' : 'Create' }}
        </Button>
      </Flex>
    </template>
  </modal>
</template>

<style scoped lang="scss">
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
