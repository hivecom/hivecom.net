<script setup lang="ts">
import type { ProjectFormState } from '@/lib/projects'
import type { Tables } from '@/types/database.overrides'
import { Button, Flex, Modal, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ProjectFormFields from '@/components/Community/ProjectFormFields.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { invalidateProjectsCache } from '@/composables/useDataProjects'
import { usePermissions } from '@/composables/usePermissions'
import { emptyProjectForm, projectFormFromRow, projectFormPayload, validateProjectForm } from '@/lib/projects'

const props = defineProps<{
  project: Tables<'projects'>
}>()

const emit = defineEmits<{
  saved: []
  deleted: []
}>()

const open = defineModel<boolean>('open')
const fullscreen = ref(false)

const supabase = useSupabaseClient()
const userId = useUserId()
const { hasPermission } = usePermissions()

const canDelete = computed(() => hasPermission('projects.delete'))

const formFieldsRef = ref<InstanceType<typeof ProjectFormFields> | null>(null)

const form = ref<ProjectFormState>(emptyProjectForm())

const validation = computed(() => validateProjectForm(form.value))
const isValid = computed(() => Object.values(validation.value).every(Boolean))

const saveLoading = ref(false)
const saveError = ref<string | null>(null)

const deleteLoading = ref(false)
const showDeleteConfirm = ref(false)

// Load the row fresh on every open so a cancelled edit leaves nothing behind
watch(open, (isOpen) => {
  if (isOpen) {
    form.value = projectFormFromRow(props.project)
    saveError.value = null
    return
  }

  showDeleteConfirm.value = false
  fullscreen.value = false
})

async function handleSubmit() {
  if (!isValid.value)
    return

  saveLoading.value = true
  saveError.value = null

  try {
    // The editor shows its own toast when an upload fails, so just stop here
    const uploaded = await formFieldsRef.value?.flushPendingUploads()
    if (uploaded === false)
      return

    const { error } = await supabase
      .from('projects')
      .update({
        ...projectFormPayload(form.value),
        modified_at: new Date().toISOString(),
        modified_by: userId.value,
      })
      .eq('id', props.project.id)

    if (error)
      throw error

    invalidateProjectsCache()
    open.value = false
    emit('saved')
  }
  catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Failed to update project. Please try again.'
  }
  finally {
    saveLoading.value = false
  }
}

async function handleDelete() {
  deleteLoading.value = true
  saveError.value = null

  try {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', props.project.id)

    if (error)
      throw error

    invalidateProjectsCache()
    open.value = false
    emit('deleted')
  }
  catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Failed to delete project. Please try again.'
    showDeleteConfirm.value = false
  }
  finally {
    deleteLoading.value = false
  }
}
</script>

<template>
  <Modal
    :open="open"
    :size="fullscreen ? 'screen' : 'l'"
    scrollable
    :card="{ separators: true }"
    :can-dismiss="false"
    @close="open = false"
  >
    <template #header>
      <Flex x-between y-center expand>
        <Flex column :gap="0">
          <h4>Edit Project</h4>
          <p class="text-color-light text-xs">
            {{ props.project.title }}
          </p>
        </Flex>
        <Tooltip>
          <Button plain square size="s" @click="fullscreen = !fullscreen">
            <Icon :name="fullscreen ? 'ph:arrows-in' : 'ph:arrows-out'" />
          </Button>
          <template #tooltip>
            <p>{{ fullscreen ? 'Collapse' : 'Expand' }}</p>
          </template>
        </Tooltip>
      </Flex>
    </template>

    <ProjectFormFields
      ref="formFieldsRef"
      v-model="form"
      :validation="validation"
      :project-id="props.project.id"
    />

    <p v-if="saveError" class="text-xs text-color-red">
      {{ saveError }}
    </p>

    <template #footer>
      <Flex gap="xs" x-between expand>
        <Flex gap="xs">
          <Tooltip v-if="canDelete">
            <Button
              variant="danger"
              square
              :loading="deleteLoading"
              @click="showDeleteConfirm = true"
            >
              <Icon name="ph:trash" />
            </Button>
            <template #tooltip>
              <p>Delete project</p>
            </template>
          </Tooltip>
        </Flex>

        <Flex gap="xs">
          <Button plain @click="open = false">
            Cancel
          </Button>
          <Button
            variant="accent"
            :disabled="!isValid"
            :loading="saveLoading"
            @click="handleSubmit"
          >
            Save changes
          </Button>
        </Flex>
      </Flex>
    </template>
  </Modal>

  <ConfirmModal
    v-model:open="showDeleteConfirm"
    :confirm-loading="deleteLoading"
    title="Delete project"
    :description="`Are you sure you want to delete '${props.project.title}'? This cannot be undone.`"
    confirm-text="Delete"
    :destructive="true"
    @confirm="handleDelete"
  />
</template>

<style lang="scss" scoped>
.text-color-red {
  color: var(--color-text-red);
  padding-top: var(--space);
}
</style>
