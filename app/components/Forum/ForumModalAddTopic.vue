<script setup lang="ts">
// List items for a discussion under a topic

import type { TopicWithDiscussions } from '@/pages/forum/index.vue'
import type { Tables } from '@/types/database.types'
import { defineRules, maxLength, minLenNoSpace, required, useValidation } from '@dolanske/v-valid'
import { Button, Card, Dropdown, Flex, Input, Modal, pushToast, Switch } from '@dolanske/vui'
import { composedPathToString, composePathToTopic } from '@/lib/topics'
import { normalizeErrors, slugify } from '@/lib/utils/formatting'

const props = defineProps<{
  open: boolean
  topics: Tables<'discussion_topics'>[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', topic: TopicWithDiscussions): void
}>()

const supabase = useSupabaseClient()

// Options to optionally select a parent topic. A 1-level deep list which
// contains paths to possibly deeply nested topics
const topicOptions = computed(() => {
  return [
    { id: '-', label: 'Top-level', parent_id: null, path: '/' },
    ...props.topics.map(topic => ({
      id: topic.id,
      label: topic.name,
      parent_id: topic.id,
      path: composedPathToString(composePathToTopic(topic.id, props.topics)),
    })),
  ]
})

// Form validation
const form = reactive({
  name: '',
  description: '',
  parent_id: null as string | null,
  is_locked: false,
})

const rules = defineRules<typeof form>({
  name: [required, minLenNoSpace(1), maxLength(128)],
})

const loading = ref(false)

const { validate, errors } = useValidation(form, rules)

function submitForm() {
  if (loading.value)
    return

  loading.value = true

  validate()
    .then(() => {
      const payload = {
        ...form,
        slug: slugify(form.name),
      }

      supabase
        .from('discussion_topics')
        .insert(payload)
        .select()
        .then(({ error, data }) => {
          loading.value = false

          if (error) {
            pushToast('Failed to create topic.')
            return
          }

          emit('created', {
            ...data[0],
            discussions: [],
          })
          emit('close')
          pushToast(`Created topic ${payload.name}.`)
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
      <h3>New topic</h3>
    </template>
    <p class="mb-l">
      Topics are top level categories in which you can create discussions. You can also nest topics within topics.
    </p>

    <Flex column gap="m">
      <Input v-model="form.name" :errors="normalizeErrors(errors.name)" label="Name" expand placeholder="Topic title" required />
      <Input v-model="form.description" :errors="normalizeErrors(errors.description)" label="Description" expand placeholder="Simply describe the topic" />

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
          Create
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
