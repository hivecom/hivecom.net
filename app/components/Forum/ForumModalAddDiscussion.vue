<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { defineRules, maxLength, minLenNoSpace, required, useValidation } from '@dolanske/v-valid'
import { Button, Card, Dropdown, DropdownTitle, Flex, Grid, Input, Modal, pushToast, searchString, Switch, Textarea } from '@dolanske/vui'
import { composedPathToString, composePathToTopic } from '@/lib/topics'
import { normalizeErrors, slugify } from '@/lib/utils/formatting'

interface Props {
  open: boolean
  editedItem?: Tables<'discussions'>
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', discussion: Tables<'discussions'>): void
}>()

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
    // NOTE: this could instead be shown in the UI as a disabled option with badge?
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
  description: '',
  is_locked: false,
  is_sticky: false,
  discussion_topic_id: '',
})

// When we're editing, make sure the form and edited data are in sync
watch(() => props.editedItem, (item) => {
  if (!item)
    return

  Object.assign(form, {
    name: item.title,
    description: item.description,
    is_locked: item.is_locked,
    is_sticky: item.is_sticky,
  })
}, { immediate: true })

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

function submitForm() {
  if (loading.value)
    return

  loading.value = true

  validate()
    .then(() => {
      const payload = {
        ...form,
        slug: slugify(form.title),
        ...(isEditing.value && { id: props.editedItem!.id }),
      }

      supabase
        .from('discussions')
        .upsert(payload)
        .select()
        .then(({ error, data }) => {
          loading.value = false

          if (error) {
            pushToast(`Failed to ${isEditing.value ? 'update' : 'create'} discussion`)
            return
          }

          emit('created', data[0])
          emit('close')
          pushToast(`${isEditing.value ? 'Updated' : 'Created'} discussion ${payload.title}`)
        })
    })
    .catch(() => {
      loading.value = false
    })
}
</script>

<template>
  <Modal v-bind="props" size="s" :card="{ footerSeparator: true }" @close="emit('close')">
    <template #header>
      <h3>{{ isEditing ? 'Edit' : 'New' }}  discussion</h3>
    </template>
    <p class="mb-l">
      Discussions can be created under a topic. Users will be able to post replies within discussions.
    </p>

    <Flex column gap="m">
      <Input v-model="form.title" :errors="normalizeErrors(errors.title)" label="Name" expand placeholder="What is this discussion about?" required />
      <Textarea v-model="form.description" hint="You can use markdown" :errors="normalizeErrors(errors.description)" label="Content" expand placeholder="Add more context to the discussion" />

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
            <template v-if="topicOptions.length === 0">
              <p class="">
                No options found.
              </p>
            </template>
          </template>
        </Dropdown>
      </div>

      <Card class="card-bg">
        <Grid :columns="2" gap="m">
          <Switch v-model="form.is_locked" label="Locked" />
          <Switch v-model="form.is_sticky" label="Sticky" />
        </Grid>
      </Card>
    </Flex>

    <template #footer>
      <Flex gap="s" x-end>
        <Button plain @click="emit('close')">
          Cancel
        </Button>
        <Button variant="accent" :loading="loading" @click="submitForm">
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
