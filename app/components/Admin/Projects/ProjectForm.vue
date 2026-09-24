<script setup lang="ts">
import type { ProjectFormState } from '@/lib/projects'
import type { TablesInsert, TablesUpdate } from '@/types/database.overrides'
import { Button, Flex, Sheet, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ProjectFormFields from '@/components/Community/ProjectFormFields.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { emptyProjectForm, projectFormFromRow, projectFormPayload, validateProjectForm } from '@/lib/projects'

const props = defineProps<{
  project: QueryProject | null
  isEditMode: boolean
}>()

const emit = defineEmits<{
  (e: 'save', project: TablesInsert<'projects'> | TablesUpdate<'projects'>): void
  (e: 'delete', projectId: number): void
}>()

interface QueryProject {
  created_at: string
  created_by: string
  description: string | null
  id: number
  link: string | null
  markdown: string
  modified_at: string | null
  modified_by: string | null
  owner: string | null
  tags: string[] | null
  title: string
  github: string | null
}

const isOpen = defineModel<boolean>('open', { default: false })

const formFieldsRef = ref<InstanceType<typeof ProjectFormFields> | null>(null)

const projectForm = ref<ProjectFormState>(emptyProjectForm())

const showDeleteConfirm = ref(false)
const saveLoading = ref(false)

const validation = computed(() => validateProjectForm(projectForm.value))
const isValid = computed(() => Object.values(validation.value).every(Boolean))

watch(
  () => props.project,
  (newProject) => {
    projectForm.value = newProject ? projectFormFromRow(newProject) : emptyProjectForm()
  },
  { immediate: true },
)

function handleClose() {
  isOpen.value = false
}

async function handleSubmit() {
  if (!isValid.value)
    return

  // Flush pending blob-placeholder media first, or blob: URLs get persisted and
  // render as missing media. The editor shows its own error toast, so just abort.
  const uploaded = await formFieldsRef.value?.flushPendingUploads()
  if (uploaded === false)
    return

  saveLoading.value = true
  emit('save', projectFormPayload(projectForm.value))
}

watch(isOpen, (open) => {
  if (!open)
    saveLoading.value = false
})

function handleDelete() {
  if (!props.project)
    return

  showDeleteConfirm.value = true
}

function confirmDelete() {
  if (!props.project)
    return

  emit('delete', props.project.id)
}
</script>

<template>
  <Sheet
    :open="isOpen"
    position="right"
    :card="{ separators: true }"
    :size="700"
    :can-dismiss="false"
    @close="handleClose"
  >
    <template #header>
      <Flex column :gap="0">
        <h4>{{ props.isEditMode ? 'Edit Project' : 'Add Project' }}</h4>
        <p v-if="props.isEditMode && props.project" class="text-color-light text-xs">
          {{ props.project.title }}
        </p>
      </Flex>
    </template>

    <div class="project-form">
      <ProjectFormFields
        ref="formFieldsRef"
        v-model="projectForm"
        :validation="validation"
        :project-id="props.project?.id"
      />
    </div>

    <template #footer>
      <Flex gap="xs" class="form-actions">
        <Button
          type="submit"
          variant="accent"
          :disabled="!isValid || saveLoading"
          :loading="saveLoading"
          @click.prevent="handleSubmit"
        >
          <template #start>
            <Icon name="ph:check" />
          </template>
          {{ props.isEditMode ? 'Update' : 'Create' }}
        </Button>

        <Button @click.prevent="handleClose">
          Cancel
        </Button>

        <div class="flex-1" />

        <Tooltip v-if="props.isEditMode">
          <Button
            variant="danger"
            square
            @click.prevent="handleDelete"
          >
            <Icon name="ph:trash" />
          </Button>
          <template #tooltip>
            <p>Delete project</p>
          </template>
        </Tooltip>
      </Flex>
    </template>

    <ConfirmModal
      v-model:open="showDeleteConfirm"
      :confirm="confirmDelete"
      title="Confirm Delete Project"
      :description="`Are you sure you want to delete the project '${props.project?.title}'? This action cannot be undone.`"
      confirm-text="Delete"
      cancel-text="Cancel"
      :destructive="true"
    />
  </Sheet>
</template>

<style scoped lang="scss">
.project-form {
  padding-bottom: var(--space);
}

.form-actions {
  margin-top: var(--space);
}

.flex-1 {
  flex: 1;
}
</style>
