<script setup lang="ts">
import { defineRules, maxLength, minLenNoSpace, required, useValidation } from '@dolanske/v-valid'
import { Button, Card, Dropdown, Flex, Grid, Input, Modal, Switch } from '@dolanske/vui'
import { normalizeErrors } from '@/lib/utils/formatting'

const props = defineProps<{
  open: boolean
  isEditing?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const topicOptions = computed(() => {
  return [
    { label: 'Top-level', parentId: null, path: '/' },
    { label: 'Rules', parentId: 1, path: '/rules' },
    { label: 'Announcements', parentId: 2, path: '/announcements' },
  ]
})

const form = reactive({
  name: '',
  description: '',
  // Null for top-level topics
  parentId: null as number | null,
  locked: false,
  private: false,
})

const rules = defineRules<typeof form>({
  name: [required, minLenNoSpace(1), maxLength(128)],
  description: {
    minLenNoSpace: minLenNoSpace(1),
  },
})

const loading = ref(false)
const { validate, errors } = useValidation(form, rules)

function submitForm() {
  if (loading.value)
    return

  loading.value = true

  validate()
    .then(() => {
      // TODO
      // Passed validation
    })
    .catch(() => {
      loading.value = false
    })
}
</script>

<template>
  <Modal v-bind="props" size="s" :card="{ footerSeparator: true }" @close="emit('close')">
    <template #header>
      <h3>Add a topic</h3>
    </template>
    <p class="mb-l">
      Topics are top level categories in which you can create discussions. You can also nest topics within topics.
    </p>

    <Flex column gap="m">
      <Input :errors="normalizeErrors(errors.name)" label="Name" expand placeholder="Topic title" required />
      <Input :errors="normalizeErrors(errors.description)" label="Description" expand placeholder="Simply describe the topic" />

      <div class="w-100">
        <label class="vui-label">Location</label>
        <Dropdown expand>
          <template #trigger="{ toggle, isOpen }">
            <Button expand class="w-100" :loading="loading" outline @click="toggle">
              <template #start>
                {{ form.parentId === null ? 'Top-level' : topicOptions.find(o => o.parentId === form.parentId)?.label || 'Select parent topic' }}
              </template>
              <template #end>
                <Icon :name="isOpen ? 'ph:caret-up' : 'ph:caret-down'" :size="16" />
              </template>
            </Button>
          </template>
          <template #default="{ close }">
            <Flex column gap="xxs">
              <button v-for="option in topicOptions" :key="option.path" :label="option.label" expand class="form-add-topic__button" @click="form.parentId = option.parentId, close()">
                <span>{{ option.label }}</span>
                <p class="font-size-xs">
                  {{ option.path }}
                </p>
              </button>
            </Flex>
          </template>
        </Dropdown>
      </div>

      <Card>
        <Grid :columns="2" gap="m">
          <Switch v-model="form.locked" label="Locked" />
          <Switch v-model="form.private" label="Private" />
        </Grid>
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
