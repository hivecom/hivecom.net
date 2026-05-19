<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Badge, Button, ButtonGroup, Calendar, Dropdown, DropdownItem, DropdownTitle, Flex, Input, searchString, Select, Sheet, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import { useSupabaseClient, useSupabaseUser } from '#imports'
import RichTextEditor from '@/components/Editor/RichTextEditor.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import FileUpload from '@/components/Shared/FileUpload.vue'
import { useDataForumTopics } from '@/composables/useDataForumTopics'
import { deleteGameAsset, uploadGameAsset } from '@/lib/storage'
import { flattenTopicsTree } from '@/lib/topics'

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

// Multiplayer mode select options
interface SelectOption {
  label: string
  value: string
}

const multiplayerModeOptions: SelectOption[] = [
  { value: 'pvp', label: 'PvP' },
  { value: 'coop', label: 'Co-op' },
  { value: 'mmo', label: 'MMO' },
  { value: 'singleplayer', label: 'Singleplayer' },
]

const DESCRIPTION_MAX = 160
const RELEASE_DATE_MIN = new Date(1970, 0, 1)
const RELEASE_DATE_MAX = new Date(new Date().getFullYear() + 2, 11, 31)

// Forum topic picker
const { topics: forumTopics } = useDataForumTopics()
const topicSearch = ref('')

// Genre tag input
const newGenreTagInput = ref('')

// Form state
const gameForm = ref({
  name: '',
  shorthand: '',
  steam_id: '',
  website: '',
  description: '',
  markdown: '',
  genre_tags: [] as string[],
  multiplayer_modes: [] as string[],
  color: '',
  release_date: '',
  discussion_topic_id: '',
})

// State for delete confirmation modal
const showDeleteConfirm = ref(false)
const saving = ref(false)

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

// Topic picker computeds (depend on gameForm)
const topicOptions = computed(() =>
  flattenTopicsTree(forumTopics.value.filter(t => !t.is_archived))
    .filter(({ topic, path }) => topicSearch.value ? searchString([topic.name, path], topicSearch.value) : true)
    .map(({ topic, depth, path }) => ({ id: topic.id, label: topic.name, path, depth })),
)
const selectedTopicLabel = computed(() => {
  const id = gameForm.value.discussion_topic_id
  if (!id)
    return null
  return topicOptions.value.find(o => o.id === id)?.label ?? id
})

// Genre tag helpers (depend on gameForm)
function addGenreTags() {
  const raw = newGenreTagInput.value
  if (!raw.trim())
    return
  const newTags = raw
    .split(',')
    .map(t => t.trim().toLowerCase().replace(/\s+/g, '-'))
    .filter(t => t.length > 0 && !gameForm.value.genre_tags.includes(t))
  gameForm.value.genre_tags.push(...newTags)
  newGenreTagInput.value = ''
}
function removeGenreTag(tag: string) {
  gameForm.value.genre_tags = gameForm.value.genre_tags.filter(t => t !== tag)
}

// Release date <-> Date bridge for the Calendar year-picker
const releaseDateModel = computed<Date | null>({
  get() {
    return gameForm.value.release_date ? new Date(gameForm.value.release_date) : null
  },
  set(date: Date | null) {
    // store as ISO date string YYYY-MM-DD
    gameForm.value.release_date = date ? date.toISOString().slice(0, 10) : ''
  },
})

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
        description: newGame.description ?? '',
        markdown: newGame.markdown ?? '',
        genre_tags: newGame.genre_tags ?? [],
        multiplayer_modes: newGame.multiplayer_modes ?? [],
        color: newGame.color ?? '',
        release_date: newGame.release_date ?? '',
        discussion_topic_id: newGame.discussion_topic_id ?? '',
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
        description: '',
        markdown: '',
        genre_tags: [],
        multiplayer_modes: [],
        color: '',
        release_date: '',
        discussion_topic_id: '',
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

// Reset form and saving state when sheet closes
watch(isOpen, (open) => {
  if (!open) {
    resetForm()
    saving.value = false
  }
})

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
      description: '',
      markdown: '',
      genre_tags: [],
      multiplayer_modes: [],
      color: '',
      release_date: '',
      discussion_topic_id: '',
    }
  },
)

// Computed for multiplayer modes as SelectOption[] for the VUI Select component
const multiplayerModesModel = computed<SelectOption[]>({
  get() {
    return multiplayerModeOptions.filter(o => gameForm.value.multiplayer_modes.includes(o.value))
  },
  set(selection) {
    gameForm.value.multiplayer_modes = Array.isArray(selection) ? selection.map(o => o.value) : []
  },
})

// Handle closing the sheet
function resetForm() {
  gameForm.value = {
    name: '',
    shorthand: '',
    steam_id: '',
    website: '',
    description: '',
    markdown: '',
    genre_tags: [],
    multiplayer_modes: [],
    color: '',
    release_date: '',
    discussion_topic_id: '',
  }
  assetsUrl.value = { icon: null, cover: null, background: null }
  assetsError.value = { icon: null, cover: null, background: null }
  steamClientIconUrl.value = null
  shorthandManuallySet.value = false
}

function handleClose() {
  isOpen.value = false
}

// Handle form submission
function handleSubmit() {
  if (!isValid.value)
    return

  saving.value = true

  // Prepare the data to save
  const gameData = {
    name: gameForm.value.name,
    shorthand: gameForm.value.shorthand || null,
    steam_id: gameForm.value.steam_id ? Number(gameForm.value.steam_id) : null,
    website: gameForm.value.website?.trim() ? gameForm.value.website.trim() : null,
    description: gameForm.value.description.trim() || null,
    markdown: gameForm.value.markdown.trim() || null,
    genre_tags: gameForm.value.genre_tags.length > 0 ? gameForm.value.genre_tags : null,
    multiplayer_modes: gameForm.value.multiplayer_modes.length > 0 ? gameForm.value.multiplayer_modes : null,
    color: gameForm.value.color.trim() || null,
    release_date: gameForm.value.release_date || null,
    discussion_topic_id: gameForm.value.discussion_topic_id.trim() || null,
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

      <!-- Game Details Section -->
      <Flex column gap="m" expand>
        <h4>Game Details</h4>

        <!-- Tagline -->
        <Flex column gap="xxs" expand>
          <Input
            v-model="gameForm.description"
            expand
            name="description"
            label="Tagline"
            placeholder="A short one-liner about the game"
            :maxlength="DESCRIPTION_MAX"
          />
          <span class="text-xs text-color-lighter" :class="{ 'text-color-red': gameForm.description.length >= DESCRIPTION_MAX }">
            {{ gameForm.description.length }} / {{ DESCRIPTION_MAX }}
          </span>
        </Flex>

        <!-- Markdown body -->
        <RichTextEditor
          v-model="gameForm.markdown"
          label="Content"
          hint="You can use markdown and add media by drag-and-drop"
          placeholder="Write a longer description of the game..."
          min-height="180px"
          show-expand-button
        />

        <!-- Genre tags -->
        <Flex column gap="xs" expand>
          <label class="asset-label">Genre Tags</label>
          <Flex gap="xs" y-center>
            <Input
              v-model="newGenreTagInput"
              expand
              name="new-genre-tag"
              placeholder="e.g. FPS, Survival, Co-op"
              @keydown.enter.prevent="addGenreTags"
            />
            <Button variant="accent" square :disabled="!newGenreTagInput.trim()" @click="addGenreTags">
              <Icon name="ph:plus" />
            </Button>
          </Flex>
          <Flex v-if="gameForm.genre_tags.length > 0" gap="xs" wrap class="mt-xxs">
            <Badge
              v-for="tag in gameForm.genre_tags"
              :key="tag"
              size="s"
              variant="neutral"
              class="game-form__tag-badge"
            >
              {{ tag }}
              <Button size="s" square class="game-form__tag-remove" @click="removeGenreTag(tag)">
                <Icon name="ph:x" />
              </Button>
            </Badge>
          </Flex>
        </Flex>

        <!-- Multiplayer modes -->
        <Select
          v-model="multiplayerModesModel"
          :options="multiplayerModeOptions"
          label="Multiplayer Modes"
          placeholder="Select multiplayer modes (optional)"
          expand
          multiple
          show-clear
        />

        <!-- Accent color -->
        <Flex column gap="xs" expand>
          <label class="asset-label">Accent Color</label>
          <label class="game-form__color-input">
            <input
              type="color"
              :value="gameForm.color || '#000000'"
              @input="gameForm.color = ($event.target as HTMLInputElement).value"
            >
            <span class="text-s">{{ gameForm.color || 'No color set' }}</span>
            <div class="flex-1" />
            <Button
              v-if="gameForm.color"
              square
              size="s"
              plain
              @click="gameForm.color = ''"
            >
              <Icon name="ph:x" />
            </Button>
          </label>
        </Flex>

        <!-- Release year -->
        <Flex column gap="xs" expand>
          <label class="asset-label">Release Date</label>
          <Calendar
            v-model="releaseDateModel"
            year-picker
            expand
            :min-date="RELEASE_DATE_MIN"
            :max-date="RELEASE_DATE_MAX"
          >
            <template #trigger>
              <Button expand outline>
                {{ gameForm.release_date ? new Date(gameForm.release_date).getFullYear() : 'Pick a year' }}
                <template #end>
                  <Icon name="ph:calendar" />
                </template>
              </Button>
            </template>
          </Calendar>
        </Flex>

        <!-- Forum topic picker -->
        <Flex column gap="xs" expand>
          <label class="asset-label">Forum Topic</label>
          <Dropdown class="w-100">
            <template #trigger="{ toggle, isOpen: dropdownOpen }">
              <Button expand class="w-100 vui-button-select" outline @click="toggle">
                <template #start>
                  <span class="text-size-m">
                    {{ selectedTopicLabel ?? 'No topic linked' }}
                  </span>
                </template>
                <template #end>
                  <Icon :name="dropdownOpen ? 'ph:caret-up' : 'ph:caret-down'" :size="16" />
                </template>
              </Button>
            </template>
            <template #default="{ close }">
              <DropdownTitle>
                <Input v-model="topicSearch" placeholder="Search topics..." expand focus />
              </DropdownTitle>
              <Flex column :gap="0">
                <button
                  class="game-form__topic-option"
                  @click="gameForm.discussion_topic_id = '', close()"
                >
                  <span>None</span>
                </button>
                <button
                  v-for="option in topicOptions"
                  :key="option.id"
                  class="game-form__topic-option"
                  :style="option.depth > 0 ? { paddingLeft: `calc(var(--space-xs) + ${option.depth * 16}px)` } : undefined"
                  @click="gameForm.discussion_topic_id = option.id, close()"
                >
                  <span>{{ option.label }}</span>
                  <p v-if="option.path" class="text-xs text-color-lighter">
                    {{ option.path }}
                  </p>
                </button>
              </Flex>
            </template>
          </Dropdown>
          <Button
            v-if="gameForm.discussion_topic_id"
            plain
            size="s"
            class="game-form__topic-clear"
            @click="gameForm.discussion_topic_id = ''"
          >
            <template #start>
              <Icon name="ph:x" />
            </template>
            Clear
          </Button>
        </Flex>
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
          :disabled="!isValid || saving"
          :loading="saving"
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

.game-form__color-input {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  width: 100%;
  cursor: pointer;
  padding: var(--space-xs) var(--space-s);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-s);
  background: var(--color-bg);
  height: var(--interactive-el-height);

  &:hover {
    border-color: var(--color-border-strong);
  }

  .flex-1 {
    flex: 1;
  }

  input[type='color'] {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    cursor: pointer;
    background: transparent;
    border: none;
    padding: 0;

    &::-webkit-color-swatch-wrapper {
      padding: 0;
    }
    &::-webkit-color-swatch {
      border: none;
      border-radius: var(--border-radius-xs);
    }
    &::-moz-color-swatch {
      border: none;
      border-radius: var(--border-radius-xs);
    }
  }
}

.game-form__tag-badge {
  display: flex;
  align-items: center;
  gap: var(--space-xs);

  .game-form__tag-remove {
    margin-left: 2px;
    width: 16px;
    height: 16px;
    min-width: unset;
    min-height: unset;
    padding: 2px;
    border-radius: var(--border-radius-pill);
    background: rgba(0, 0, 0, 0.15);
    color: currentColor;

    &:hover {
      background: rgba(0, 0, 0, 0.35);
    }
  }
}

.game-form__topic-option {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  padding: var(--space-xs);
  align-items: flex-start;
  border-radius: var(--border-radius-m);
  text-align: left;

  &:hover {
    background-color: var(--color-button-gray-hover);
  }
}

.game-form__topic-clear {
  align-self: flex-start;
}
</style>
