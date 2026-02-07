<script setup lang="ts">
import type { TopicWithDiscussions } from '@/pages/forum/index.vue'
import type { Tables } from '@/types/database.types'
import { defineRules, maxLength, minLenNoSpace, required, useValidation } from '@dolanske/v-valid'
import { Button, Card, Dropdown, DropdownTitle, Flex, Input, Modal, pushToast, searchString, Switch } from '@dolanske/vui'
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
const topics = inject<() => Ref<Tables<'discussion_topics'>[]>>('forumTopics', () => ref([]))()
const activeTopicId = inject<() => Ref<string | null>>('forumActiveTopicId', () => ref(null))()

// Options to optionally select a parent topic. A 1-level deep list which
// contains paths to possibly deeply nested topics
const topicOptions = computed(() => {
  return [
    { id: '-', label: 'Top-level', parent_id: null, path: '/', sort_order: 0 },
    ...topics.value
      // NOTE: this could instead be shown in the UI as a disabled option with badge?
      .filter(item => !item.is_archived && !item.is_locked)
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
  description: '',
  parent_id: null as string | null,
  is_locked: false,
  sort_order: 0,
})

// When we're editing, make sure the form and edited data are in sync
watch(() => props.editedItem, (item) => {
  if (!item)
    return

  Object.assign(form, {
    name: item.name,
    parent_id: item.parent_id,
    is_locked: item.is_locked,
    sort_order: item.sort_order,
    ...(item.description && { description: item.description }),
  })
}, { immediate: true })

// Preselect a topic if we're currently in a nested view
watch(activeTopicId, (newVal) => {
  if (newVal) {
    form.parent_id = newVal
  }
}, { immediate: true })

const rules = defineRules<typeof form>({
  name: [required, minLenNoSpace(1), maxLength(128)],
  sort_order: [required],
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
        slug: slugify(form.name),
        ...(isEditing.value && { id: props.editedItem!.id }),
      }

      supabase
        .from('discussion_topics')
        .upsert(payload)
        .select()
        .then(({ error, data }) => {
          loading.value = false

          if (error) {
            pushToast(`Failed to ${isEditing.value ? 'update' : 'create'} topic`)
            return
          }

          emit('created', { ...data[0], discussions: [] })
          emit('close')
          pushToast(`${isEditing.value ? 'Updated' : 'Created'} topic ${payload.name}`)
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
      <h3>{{ isEditing ? 'Edit' : 'Create' }} topic</h3>
    </template>
    <p class="mb-l">
      Topics are top level categories in which you can create discussions. You can also nest topics within topics.
    </p>

    <Flex column gap="m">
      <Input v-model="form.name" :errors="normalizeErrors(errors.name)" label="Name" expand placeholder="Topic title" required />
      <Input v-model="form.description" :errors="normalizeErrors(errors.description)" label="Description" expand placeholder="Simply describe the topic" />
      <Input v-model="form.sort_order" :errors="normalizeErrors(errors.sort_order)" type="number" label="Sort order" expand placeholder="Set the topic sort order" />

      <div class="w-100">
        <label class="vui-label">Location</label>
        <Dropdown expand>
          <template #trigger="{ toggle, isOpen }">
            <Button expand class="w-100" :loading="loading" outline @click="toggle">
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
  </modal>
</template>

<style scoped lang="scss">
.form-add-topic__button {
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
