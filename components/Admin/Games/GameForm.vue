<script setup lang="ts">
import { Button, Flex, Input, Sheet } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ConfirmModal from '../../Shared/ConfirmModal.vue'

const props = defineProps<{
  game: {
    id: number
    name: string
    shorthand: string | null
    steam_id: number | null
    created_at: string
    created_by: string | null
  } | null
  isEditMode: boolean
}>()

// Define emits
const emit = defineEmits(['save', 'delete'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Form state
const gameForm = ref({
  name: '',
  shorthand: '',
  steam_id: '',
})

// State for delete confirmation modal
const showDeleteConfirm = ref(false)

// Form validation
const validation = computed(() => ({
  name: !!gameForm.value.name.trim(),
}))

const isValid = computed(() => Object.values(validation.value).every(Boolean))

// Update form data when game prop changes
watch(
  () => props.game,
  (newGame) => {
    if (newGame) {
      gameForm.value = {
        name: newGame.name,
        shorthand: newGame.shorthand || '',
        steam_id: newGame.steam_id ? String(newGame.steam_id) : '',
      }
    }
    else {
      // Reset form for new game
      gameForm.value = {
        name: '',
        shorthand: '',
        steam_id: '',
      }
    }
  },
  { immediate: true },
)

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Handle form submission
function handleSubmit() {
  if (!isValid.value)
    return

  // Prepare the data to save
  const gameData = {
    name: gameForm.value.name,
    shorthand: gameForm.value.shorthand || null,
    steam_id: gameForm.value.steam_id ? Number(gameForm.value.steam_id) : null,
  }

  emit('save', gameData)
}

// Open confirmation modal for deletion
function handleDelete() {
  if (!props.game)
    return

  showDeleteConfirm.value = true
}

// Perform actual deletion when confirmed
function confirmDelete() {
  if (!props.game)
    return

  emit('delete', props.game.id)
}

// Sheet title based on mode
const sheetTitle = computed(() => {
  if (props.isEditMode) {
    return `Edit Game: ${props.game?.name}`
  }
  return 'Add New Game'
})
</script>

<template>
  <Sheet
    :open="isOpen"
    position="right"
    separator
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <h4>{{ sheetTitle }}</h4>
    </template>

    <!-- Game Info Section -->
    <Flex column gap="l" class="game-form">
      <Flex column gap="m" expand>
        <h4>Game Information</h4>

        <Input
          v-model="gameForm.name"
          expand
          name="name"
          label="Name"
          required
          :valid="validation.name"
          error="Game name is required"
          placeholder="Enter game name"
        />

        <Input
          v-model="gameForm.shorthand"
          expand
          name="shorthand"
          label="Shorthand"
          placeholder="Enter game shorthand (optional)"
        />

        <Input
          v-model="gameForm.steam_id"
          expand
          name="steam_id"
          label="Steam ID"
          type="number"
          placeholder="Enter Steam app ID (optional)"
        />
      </Flex>
    </Flex>

    <!-- Form Actions -->
    <template #footer>
      <Flex gap="xs" class="form-actions">
        <Button
          type="submit"
          variant="accent"
          :disabled="!isValid"
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

        <Button
          v-if="props.isEditMode"
          variant="danger"
          square
          data-title-left="Delete game"
          @click.prevent="handleDelete"
        >
          <Icon name="ph:trash" />
        </Button>
      </Flex>
    </template>

    <!-- Confirmation Modal for Delete Action -->
    <ConfirmModal
      v-model:open="showDeleteConfirm"
      v-model:confirm="confirmDelete"
      title="Confirm Delete Game"
      :description="`Are you sure you want to delete the game '${props.game?.name}'? This action cannot be undone.`"
      confirm-text="Delete"
      cancel-text="Cancel"
      :destructive="true"
    />
  </Sheet>
</template>

<style scoped>
.game-form {
  padding-bottom: var(--space);
}
h4 {
  margin-top: 0;
  margin-bottom: var(--space-xs);
}
.form-actions {
  margin-top: var(--space);
}
</style>
