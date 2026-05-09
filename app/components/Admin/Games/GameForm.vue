<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { useSupabaseClient, useSupabaseUser } from '#imports'
import { Alert, Button, ButtonGroup, Dropdown, DropdownItem, DropdownTitle, Flex, Input, Sheet, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import FileUpload from '@/components/Shared/FileUpload.vue'
import { deleteGameAsset, uploadGameAsset } from '@/lib/storage'

const props = defineProps<{
  game: Tables<'games'> | null
  isEditMode: boolean
  prefill?: { name?: string, steam_id?: number }
}>()

// Define emits
const emit = defineEmits(['save', 'delete'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Game assets composable
const { getGameIconUrl, getGameCoverUrl, getGameBackgroundUrl, clearGameAssets } = useDataGameAssets()
const supabase = useSupabaseClient()

// Resolved Steam client icon URL (fetched from edge function)
const steamClientIconUrl = ref<string | null>(null)
const steamClientIconLoading = ref(false)

async function fetchSteamClientIcon(appId: string) {
  steamClientIconUrl.value = null
  if (!appId)
    return
  steamClientIconLoading.value = true
  try {
    const { data, error } = await supabase.functions.invoke(`admin-steam-icon-fetch?app_id=${encodeURIComponent(appId)}`, {
      method: 'GET',
    })
    if (!error && data?.icon_url)
      steamClientIconUrl.value = data.icon_url
  }
  finally {
    steamClientIconLoading.value = false
  }
}

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

// Derive a shorthand suggestion from the game name.
// Single word: full word lowercase. Multi-word: first char of each word.
// Numbers are kept as part of their word (e.g. "Spire 2" -> last token "2" contributes "2").
function suggestShorthand(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0)
  if (words.length === 0)
    return ''
  if (words.length === 1)
    return words[0]!
  return words.map(w => w[0]!).join('')
}

// Track whether shorthand was manually edited
const shorthandManuallySet = ref(false)

function onShorthandInput() {
  shorthandManuallySet.value = gameForm.value.shorthand.length > 0
}

function onNameInput() {
  if (!shorthandManuallySet.value)
    gameForm.value.shorthand = suggestShorthand(gameForm.value.name)
}

// Form validation
const validation = computed(() => ({
  name: !!gameForm.value.name.trim(),
}))

const isValid = computed(() => Object.values(validation.value).every(Boolean))

function openExternalLink(url: string | null | undefined) {
  if (!url)
    return

  window.open(url, '_blank', 'noopener,noreferrer')
}

const steamId = computed(() => {
  const raw = gameForm.value.steam_id ?? ''
  return String(raw).trim()
})

const steamGridUrl = computed(() => {
  const nameTerm = gameForm.value.name?.trim()
  const shorthandTerm = gameForm.value.shorthand?.trim()
  const term = nameTerm || shorthandTerm || steamId.value

  if (!term)
    return 'https://www.steamgriddb.com/search/grids'

  return `https://www.steamgriddb.com/search/grids?term=${encodeURIComponent(term)}`
})

const steamAssetLinks = computed(() => {
  if (!steamId.value)
    return null

  const id = steamId.value
  const baseStore = `https://shared.steamstatic.com/store_item_assets/steam/apps/${id}`
  return {
    steamGridDb: `https://www.steamgriddb.com/game/${id}`,
    steamStore: `https://store.steampowered.com/app/${id}`,
    icon: `${baseStore}/capsule_sm_120.jpg`,
    logo: `${baseStore}/logo_2x.png`,
    capsule: `${baseStore}/library_600x900_2x.jpg`,
    hero: `${baseStore}/library_hero.jpg`,
    header: `${baseStore}/header.jpg`,
  }
})

// Steam asset previews - shown transparently under upload zones when no asset uploaded
const steamAssetPreviews = computed(() => {
  if (!steamAssetLinks.value)
    return null
  return {
    // Use fetched client icon if available, fall back to logo once loading is done
    icon: steamClientIconUrl.value ?? (!steamClientIconLoading.value ? steamAssetLinks.value.logo : null),
    cover: steamAssetLinks.value.capsule,
    background: steamAssetLinks.value.hero,
  }
})

// Fetch a remote image URL and upload it as a game asset.
// For the icon, media.steampowered.com blocks cross-origin fetch, so we proxy through the edge function.
async function importSteamAsset(assetType: 'icon' | 'cover' | 'background', url: string) {
  let blob: Blob
  if (assetType === 'icon' && steamId.value) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const supabaseUrl = useRuntimeConfig().public.supabase.url as string
    const resp = await fetch(
      `${supabaseUrl}/functions/v1/admin-steam-icon-fetch?app_id=${encodeURIComponent(steamId.value)}&download=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!resp.ok)
      return
    blob = await resp.blob()
  }
  else {
    const resp = await fetch(url)
    if (!resp.ok)
      return
    blob = await resp.blob()
  }
  const ext = url.split('.').pop()?.split('?')[0] ?? 'jpg'
  const file = new File([blob], `${assetType}.${ext}`, { type: blob.type })
  await handleAssetUpload(assetType, file)
}

const importingAllAssets = ref(false)
async function importAllSteamAssets() {
  if (!steamAssetLinks.value)
    return
  importingAllAssets.value = true
  try {
    await Promise.all([
      !assetsUrl.value.icon ? importSteamAsset('icon', steamClientIconUrl.value ?? steamAssetLinks.value.icon) : Promise.resolve(),
      !assetsUrl.value.cover ? importSteamAsset('cover', steamAssetLinks.value.capsule) : Promise.resolve(),
      !assetsUrl.value.background ? importSteamAsset('background', steamAssetLinks.value.hero) : Promise.resolve(),
    ])
  }
  finally {
    importingAllAssets.value = false
  }
}

// Fetch Steam client icon whenever steam_id changes
watch(
  steamId,
  (id) => {
    fetchSteamClientIcon(id)
  },
  { immediate: true },
)

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
      // Existing game - shorthand is already set, treat as manual
      shorthandManuallySet.value = !!newGame.shorthand

      // Initialize asset URLs if shorthand exists
      if (newGame.shorthand) {
        assetsUrl.value.icon = await getGameIconUrl(newGame)
        assetsUrl.value.cover = await getGameCoverUrl(newGame)
        assetsUrl.value.background = await getGameBackgroundUrl(newGame)
      }
    }
    else {
      // Reset form for new game (apply prefill if provided)
      const prefillName = props.prefill?.name ?? ''
      shorthandManuallySet.value = false
      gameForm.value = {
        name: prefillName,
        shorthand: prefillName ? suggestShorthand(prefillName) : '',
        steam_id: props.prefill?.steam_id != null ? String(props.prefill.steam_id) : '',
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

// Re-apply prefill when it changes (e.g. opening form for a different Steam game)
watch(
  () => props.prefill,
  (newPrefill) => {
    if (props.game)
      return
    const prefillName = newPrefill?.name ?? ''
    shorthandManuallySet.value = false
    gameForm.value = {
      name: prefillName,
      shorthand: prefillName ? suggestShorthand(prefillName) : '',
      steam_id: newPrefill?.steam_id != null ? String(newPrefill.steam_id) : '',
      website: '',
    }
  },
)

// Handle closing the sheet
function resetForm() {
  gameForm.value = { name: '', shorthand: '', steam_id: '', website: '' }
  assetsUrl.value = { icon: null, cover: null, background: null }
  assetsError.value = { icon: null, cover: null, background: null }
  steamClientIconUrl.value = null
  shorthandManuallySet.value = false
}

function handleClose() {
  isOpen.value = false
  resetForm()
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
  resetForm()
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
    const user = useSupabaseUser()
    const result = await uploadGameAsset(supabase, gameForm.value.shorthand, assetType, file, user.value?.id)

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
    :card="{ separators: true }"
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex column :gap="0">
        <h4>{{ props.isEditMode ? 'Edit Game' : 'Add Game' }}</h4>
        <p v-if="props.isEditMode && props.game" class="text-color-light text-xs">
          {{ props.game.name }}
        </p>
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
          @input="onNameInput"
        />

        <Input
          v-model="gameForm.shorthand"
          expand
          name="shorthand"
          label="Shorthand"
          placeholder="Enter game shorthand (optional)"
          @input="onShorthandInput"
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
      <Flex column gap="m" expand>
        <Flex x-between y-center expand>
          <h4>Game Assets</h4>
          <Flex gap="xs" y-center>
            <Tooltip>
              <Button
                square
                @click="openExternalLink(steamGridUrl)"
              >
                <Icon name="simple-icons:steamdb" />
              </Button>
              <template #tooltip>
                <p>Open on SteamGridDB</p>
              </template>
            </Tooltip>

            <ButtonGroup>
              <Tooltip v-if="steamAssetLinks">
                <Button
                  square
                  :loading="importingAllAssets"
                  @click="importAllSteamAssets"
                >
                  <Icon name="ph:download-simple" />
                </Button>
                <template #tooltip>
                  <p>Import all assets from Steam</p>
                </template>
              </Tooltip>

              <Dropdown v-if="steamAssetLinks" placement="bottom-end">
                <template #trigger="{ toggle }">
                  <Button
                    square
                    @click="toggle()"
                  >
                    <Icon name="ph:steam-logo" />
                    <Icon name="ph:caret-down" size="12" />
                  </Button>
                </template>

                <DropdownTitle>
                  Steam Assets
                </DropdownTitle>
                <DropdownItem icon="ph:storefront" @click="openExternalLink(steamAssetLinks.steamStore)">
                  Store page
                </DropdownItem>
                <DropdownItem icon="ph:app-window" @click="openExternalLink(steamAssetLinks.icon)">
                  Icon (capsule small 120px)
                </DropdownItem>
                <DropdownItem icon="ph:image-square" @click="openExternalLink(steamAssetLinks.logo)">
                  Logo (2x)
                </DropdownItem>
                <DropdownItem icon="ph:portrait" @click="openExternalLink(steamAssetLinks.capsule)">
                  Capsule (library 600x900)
                </DropdownItem>
                <DropdownItem icon="ph:panorama" @click="openExternalLink(steamAssetLinks.hero)">
                  Hero (library hero)
                </DropdownItem>
                <DropdownItem icon="ph:image" @click="openExternalLink(steamAssetLinks.header)">
                  Header (store)
                </DropdownItem>
              </Dropdown>
            </ButtonGroup>
          </Flex>
        </Flex>
        <p class="text-s text-color-light">
          Upload visual assets for the game. These will be displayed throughout the platform.
        </p>
        <Alert variant="warning" filled class="mb-m text-s">
          <p class="text-xs">
            Uploading assets will immediately apply them, even if this dialog is cancelled or closed.
          </p>
        </Alert>

        <template v-if="gameForm.shorthand">
          <Flex column gap="m" expand>
            <Flex expand>
              <!-- Icon Upload -->
              <Flex column gap="xs" expand>
                <label class="asset-label">Game Icon</label>
                <FileUpload
                  expand
                  :preview-url="assetsUrl.icon"
                  :background-preview-url="!assetsUrl.icon ? steamAssetPreviews?.icon : null"
                  :background-loading="!assetsUrl.icon && steamClientIconLoading"
                  label="Upload Icon"
                  :loading="assetsUploading.icon"
                  :error="assetsError.icon"
                  :aspect-ratio="1"
                  :min-height="150"
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
                  expand
                  :preview-url="assetsUrl.cover"
                  :background-preview-url="!assetsUrl.cover ? steamAssetPreviews?.cover : null"
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
                expand
                :preview-url="assetsUrl.background"
                :background-preview-url="!assetsUrl.background ? steamAssetPreviews?.background : null"
                label="Upload Background"
                :loading="assetsUploading.background"
                :error="assetsError.background"
                :min-height="120"
                @upload="(file) => handleAssetUpload('background', file)"
                @remove="() => handleAssetRemove('background')"
              />
              <span class="text-xs text-color-light">Recommended: 1920x1080px wide image</span>
            </Flex>
          </Flex>
        </template>

        <div v-else-if="props.isEditMode" class="asset-notice">
          <Icon name="ph:info" />
          <span>Add a shorthand to enable asset uploads</span>
        </div>
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

        <Tooltip v-if="props.isEditMode">
          <Button
            variant="danger"
            square
            @click.prevent="handleDelete"
          >
            <Icon name="ph:trash" />
          </Button>
          <template #tooltip>
            <p>Delete game</p>
          </template>
        </Tooltip>
      </Flex>
    </template>

    <!-- Confirmation Modal for Delete Action -->
    <ConfirmModal
      v-model:open="showDeleteConfirm"
      :confirm="confirmDelete"
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
  font-size: var(--font-size-m);
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
