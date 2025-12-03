<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Button, Flex, Input, Sheet } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import FileUpload from '@/components/Shared/FileUpload.vue'
import { deleteGameAsset, uploadGameAsset } from '@/lib/storage'

const props = defineProps<{
  game: Tables<'games'> | null
  isEditMode: boolean
}>()

// Define emits
const emit = defineEmits(['save', 'delete'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Game assets composable
const { getGameIconUrl, getGameCoverUrl, getGameBackgroundUrl, clearGameAssets } = useGameAssets()

// Form state
const gameForm = ref({
  name: '',
  shorthand: '',
  steam_id: '',
  website: '',
})

// State for delete confirmation modal
const showDeleteConfirm = ref(false)

// Asset upload state
const assetsUploading = ref({
  icon: false,
  cover: false,
  background: false,
})
const assetsError = ref({
  icon: null as string | null,
  cover: null as string | null,
  background: null as string | null,
})
const assetsUrl = ref({
  icon: null as string | null,
  cover: null as string | null,
  background: null as string | null,
})

// Form validation
const validation = computed(() => ({
  name: !!gameForm.value.name.trim(),
}))

const isValid = computed(() => Object.values(validation.value).every(Boolean))

// Update form data when game prop changes
watch(
  () => props.game,
  async (newGame) => {
    if (newGame) {
      gameForm.value = {
        name: newGame.name || '',
        shorthand: newGame.shorthand || '',
        steam_id: newGame.steam_id ? String(newGame.steam_id) : '',
        website: newGame.website || '',
      }

      // Initialize asset URLs if shorthand exists
      if (newGame.shorthand) {
        assetsUrl.value.icon = await getGameIconUrl(newGame)
        assetsUrl.value.cover = await getGameCoverUrl(newGame)
        assetsUrl.value.background = await getGameBackgroundUrl(newGame)
      }
    }
    else {
      // Reset form for new game
      gameForm.value = {
        name: '',
        shorthand: '',
        steam_id: '',
        website: '',
      }

      assetsUrl.value = {
        icon: null,
        cover: null,
        background: null,
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
    website: gameForm.value.website?.trim() ? gameForm.value.website.trim() : null,
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

// Handle asset upload
async function handleAssetUpload(assetType: 'icon' | 'cover' | 'background', file: File) {
  if (!gameForm.value.shorthand)
    return

  try {
    assetsUploading.value[assetType] = true
    assetsError.value[assetType] = null

    const supabase = useSupabaseClient()
    const result = await uploadGameAsset(supabase, gameForm.value.shorthand, assetType, file)

    if (result.success && result.url) {
      assetsUrl.value[assetType] = result.url
      // Clear cache for this game to ensure fresh data
      if (props.game?.id)
        clearGameAssets(props.game.id)
    }
    else {
      assetsError.value[assetType] = result.error || `Failed to upload ${assetType}`
    }
  }
  catch (error) {
    console.error(`Error uploading ${assetType}:`, error)
    assetsError.value[assetType] = 'An unexpected error occurred'
  }
  finally {
    assetsUploading.value[assetType] = false
  }
}

// Handle asset removal
async function handleAssetRemove(assetType: 'icon' | 'cover' | 'background') {
  if (!gameForm.value.shorthand)
    return

  try {
    const supabase = useSupabaseClient()
    const result = await deleteGameAsset(supabase, gameForm.value.shorthand, assetType)

    if (result.success) {
      assetsUrl.value[assetType] = null
      assetsError.value[assetType] = null
      // Clear cache for this game to ensure fresh data
      if (props.game?.id)
        clearGameAssets(props.game.id)
    }
    else {
      assetsError.value[assetType] = result.error || 'Failed to remove asset'
    }
  }
  catch (error) {
    console.error(`Error removing ${assetType}:`, error)
    assetsError.value[assetType] = 'Failed to remove asset'
  }
}
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
      <Flex column :gap="0">
        <h4>{{ props.isEditMode ? 'Edit Game' : 'Add Game' }}</h4>
        <span v-if="props.isEditMode && props.game" class="text-color-light text-xxs">
          {{ props.game.name }}
        </span>
      </Flex>
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

        <Input
          v-model="gameForm.website"
          expand
          name="website"
          label="Website"
          type="url"
          placeholder="https://example.com (optional)"
        />
      </Flex>

      <!-- Asset Upload Section -->
      <Flex v-if="gameForm.shorthand" column gap="m" expand>
        <h4>Game Assets</h4>
        <p class="text-s text-color-light">
          Upload visual assets for the game. These will be displayed throughout the platform.
        </p>
        <p class="text-xs text-color-light">
          Note: Uploading assets will immediately apply them, even if this dialog is cancelled or closed.
        </p>

        <Flex column gap="m" expand>
          <Flex expand>
            <!-- Icon Upload -->
            <Flex column gap="xs" expand>
              <label class="asset-label">Game Icon</label>
              <FileUpload
                :preview-url="assetsUrl.icon"
                label="Upload Icon"
                :loading="assetsUploading.icon"
                :error="assetsError.icon"
                :aspect-ratio="1"
                :max-height="300"
                @upload="(file) => handleAssetUpload('icon', file)"
                @remove="() => handleAssetRemove('icon')"
              />
              <span class="text-xs text-color-light">Recommended: 512x512px square image</span>
            </Flex>

            <!-- Cover Upload -->
            <Flex column gap="xs" expand>
              <label class="asset-label">Game Cover</label>
              <FileUpload
                :preview-url="assetsUrl.cover"
                label="Upload Cover"
                :loading="assetsUploading.cover"
                :error="assetsError.cover"
                :aspect-ratio="600 / 900"
                @upload="(file) => handleAssetUpload('cover', file)"
                @remove="() => handleAssetRemove('cover')"
              />
              <span class="text-xs text-color-light">Recommended: 600x900px portrait image</span>
            </Flex>
          </Flex>

          <!-- Background Upload -->
          <Flex column gap="xs" expand>
            <label class="asset-label">Game Background</label>
            <FileUpload
              :preview-url="assetsUrl.background"
              label="Upload Background"
              :loading="assetsUploading.background"
              :error="assetsError.background"
              :aspect-ratio="1920 / 1080"
              :min-height="120"
              @upload="(file) => handleAssetUpload('background', file)"
              @remove="() => handleAssetRemove('background')"
            />
            <span class="text-xs text-color-light">Recommended: 1920x1080px wide image</span>
          </Flex>
        </Flex>
      </Flex>

      <div v-else-if="props.isEditMode" class="asset-notice">
        <Icon name="ph:info" />
        <span>Add a shorthand to enable asset uploads</span>
      </div>
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

<style scoped lang="scss">
.game-form {
  padding-bottom: var(--space);
}

.form-actions {
  margin-top: var(--space);
}

.asset-label {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  margin-bottom: var(--space-xs);
}

.asset-notice {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  padding: var(--space-m);
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-s);
  color: var(--color-text-light);
  font-size: var(--font-size-s);

  .iconify {
    color: var(--color-text-blue);
  }
}
</style>
