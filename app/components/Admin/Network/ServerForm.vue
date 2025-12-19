<script setup lang="ts">
import type { Tables, TablesInsert } from '@/types/database.types'
import { Button, Flex, Input, Sheet, Switch } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'

const props = defineProps<{
  server: Tables<'servers'> | null
  isEditMode: boolean
}>()

const emit = defineEmits(['save', 'delete'])
const isOpen = defineModel<boolean>('isOpen')

// Form state

const serverForm = ref<TablesInsert<'servers'>>({
  address: '',
  active: true,
  docker_control: false,
  docker_control_port: null,
  docker_control_secure: false,
  docker_control_subdomain: null,
  created_by: null,
})

// Computed for v-model compatibility (null <-> undefined)
const dockerControlPortModel = computed({
  get: () => serverForm.value.docker_control_port ?? undefined,
  set: (val: string | number | undefined) => {
    if (val === '' || val === undefined)
      serverForm.value.docker_control_port = null
    else if (typeof val === 'string')
      serverForm.value.docker_control_port = val === '' ? null : Number(val)
    else serverForm.value.docker_control_port = val
  },
})
const dockerControlSubdomainModel = computed({
  get: () => serverForm.value.docker_control_subdomain ?? undefined,
  set: (val: string | undefined) => {
    serverForm.value.docker_control_subdomain = val === '' || val === undefined ? null : val
  },
})

const showDeleteConfirm = ref(false)
const showEditConfirm = ref(false)

// Validation
const validation = computed(() => ({
  address: !!serverForm.value.address.trim(),
}))
const isValid = computed(() => Object.values(validation.value).every(Boolean))

// Confirm modal handler for edit
function handleEditConfirm() {
  showEditConfirm.value = false
  emit('save', { ...serverForm.value })
}

// Watch for prop changes
watch(
  () => props.server,
  (newServer) => {
    if (newServer) {
      serverForm.value = {
        address: newServer.address,
        active: newServer.active,
        docker_control: newServer.docker_control,
        docker_control_port: newServer.docker_control_port,
        docker_control_secure: newServer.docker_control_secure,
        docker_control_subdomain: newServer.docker_control_subdomain,
        created_by: newServer.created_by,
      }
    }
    else {
      serverForm.value = {
        address: '',
        active: true,
        docker_control: false,
        docker_control_port: null,
        docker_control_secure: false,
        docker_control_subdomain: null,
        created_by: null,
      }
    }
    // Reset confirm modals when opening form
    showEditConfirm.value = false
    showDeleteConfirm.value = false
  },
  { immediate: true },
)

function handleSave() {
  if (!isValid.value)
    return
  if (props.isEditMode) {
    showEditConfirm.value = true
  }
  else {
    emit('save', { ...serverForm.value })
  }
}

function handleDelete() {
  showDeleteConfirm.value = false
  emit('delete', props.server?.id)
}
</script>

<template>
  <Sheet
    :open="isOpen"
    position="right"
    :card="{ separators: true }"
    :size="600"
    @close="isOpen = false"
  >
    <template #header>
      <Flex column :gap="0">
        <h4>{{ props.isEditMode ? 'Edit Server' : 'Add Server' }}</h4>
        <span v-if="props.isEditMode && props.server" class="text-color-light text-xxs">
          {{ props.server.address }}
        </span>
      </Flex>
    </template>

    <Flex column gap="l" class="server-form">
      <!-- Basic Information -->
      <Flex column gap="m" expand>
        <h4>Basic Information</h4>
        <Input
          v-model="serverForm.address"
          expand
          name="address"
          label="Address"
          required
          :valid="validation.address"
          error="Server address is required"
          placeholder="Enter server address"
        />
        <Switch v-model="serverForm.active" label="Active" />
      </Flex>

      <!-- Docker Configuration -->
      <Flex column gap="m" expand>
        <h4>Docker Configuration</h4>
        <Switch v-model="serverForm.docker_control" label="Docker Control Enabled" />
        <Flex gap="m" wrap>
          <Input
            v-model="dockerControlPortModel"
            expand
            name="docker_control_port"
            label="Docker Control Port"
            placeholder="Enter port (optional)"
            type="number"
          />
          <Input
            v-model="dockerControlSubdomainModel"
            expand
            name="docker_control_subdomain"
            label="Docker Control Subdomain"
            placeholder="Enter subdomain (optional)"
          />
        </Flex>
        <Switch v-model="serverForm.docker_control_secure" label="Docker Control Secure" />
      </Flex>
    </Flex>

    <template #footer>
      <Flex gap="xs" class="form-actions">
        <Button
          type="submit"
          :variant="props.isEditMode ? 'danger' : 'accent'"
          :disabled="!isValid"
          @click.prevent="props.isEditMode ? showEditConfirm = true : handleSave()"
        >
          <template #start>
            <Icon name="ph:check" />
          </template>
          {{ props.isEditMode ? 'Save' : 'Create' }}
        </Button>
        <Button @click.prevent="isOpen = false">
          Cancel
        </Button>
        <div class="flex-1" />
        <Button
          v-if="props.isEditMode"
          variant="danger"
          square
          data-title-left="Delete server"
          @click.prevent="showDeleteConfirm = true"
        >
          <Icon name="ph:trash" />
        </Button>
      </Flex>
    </template>

    <ConfirmModal
      v-model:open="showDeleteConfirm"
      v-model:confirm="handleDelete"
      title="Delete Server"
      :description="`Are you sure you want to delete the server '${props.server?.address}'? This action cannot be undone.`"
      confirm-text="Delete"
      cancel-text="Cancel"
      :destructive="true"
      @close="showDeleteConfirm = false"
    />
    <ConfirmModal
      v-model:open="showEditConfirm"
      v-model:confirm="handleEditConfirm"
      title="Modify Server?"
      description="Modifying an existing server can impact container statuses if the server address is invalid or the server is configured incorrectly. Are you sure you want to continue?"
      confirm-text="Continue"
      cancel-text="Cancel"
      :destructive="true"
      @close="showEditConfirm = false"
    />
  </Sheet>
</template>

<style scoped lang="scss">
.server-form {
  padding-bottom: var(--space);
}
.form-actions {
  margin-top: var(--space);
}
.flex-1 {
  flex: 1;
}
</style>
