<script setup lang="ts">
import { defineRules, maxLength, minLenNoSpace, required, useValidation } from '@dolanske/v-valid'
import { Button, Card, Flex, Grid, Input, Modal, Select, Switch } from '@dolanske/vui'
import { normalizeErrors } from '@/lib/utils/formatting'

const props = defineProps<{
  open: boolean
  // TODO: implemented editing. Its value will be a discussion object
  edit?: never
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const topicOptions = computed(() => {
  return [
    { label: 'Rules', value: 1 },
    { label: 'Announcements', value: 2 },
  ]
})

const form = reactive({
  name: '',
  description: '',
  locked: false,
  private: false,
})

const selectedId = ref()

const rules = defineRules<typeof form>({
  name: [required, minLenNoSpace(1), maxLength(128)],
  description: [minLenNoSpace(1)],
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
      <h3>New discussion</h3>
    </template>
    <p class="mb-l">
      Discussions can be created under a topic. Users will be able to post replies within discussions.
    </p>

    <Flex column gap="m">
      <Input :errors="normalizeErrors(errors.name)" label="Name" expand placeholder="What is this discussion about?" required />
      <Input :errors="normalizeErrors(errors.description)" label="Description" expand placeholder="Add more context to the discussion" />

      <Select
        v-model="selectedId"
        :options="topicOptions"
        label="Topic"
        hint="Choose which topic will this discussion be created under"
        expand
        required
      />

      <Card class="card-bg">
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
