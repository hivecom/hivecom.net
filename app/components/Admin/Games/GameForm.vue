<script setup lang="ts">
import type { IgdbGameDetails } from '@/composables/useIgdb'
import type { Tables } from '@/types/database.overrides'
import { Alert, Button, ButtonGroup, Calendar, Dropdown, DropdownItem, DropdownTitle, Flex, Input, searchString, Select, Sheet, Tooltip } from '@dolanske/vui'
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useSupabaseClient, useSupabaseUser } from '#imports'
import IGDBLookupModal from '@/components/Admin/Games/IGDBLookupModal.vue'
import ColorPicker from '@/components/Shared/ColorPicker.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import FileUpload from '@/components/Shared/FileUpload.vue'
import TagInput from '@/components/Shared/TagInput.vue'
import { useDataForumTopics } from '@/composables/useDataForumTopics'
import { deleteGameAsset, uploadGameAsset } from '@/lib/storage'
import { flattenTopicsTree } from '@/lib/topics'
import { sanitizeTag } from '@/lib/utils/sanitize'

const props = defineProps<{
  game: Tables<'games'> | null
  isEditMode: boolean
  prefill?: { name?: string, steam_id?: number }
}>()

// Define emits
const emit = defineEmits(['save', 'delete'])

const RichTextEditor = defineAsyncComponent(() => import('@/components/Editor/RichTextEditor.vue'))

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

// Form state
const gameForm = ref({
  name: '',
  shorthand: '',
  steam_id: '',
  website: '',
  description: '',
  markdown: '',
  genre_tags: [] as string[],
  multiplayer_modes: [] as SelectOption[],
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
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

const validation = computed(() => ({
  name: !!gameForm.value.name.trim(),
  color: !gameForm.value.color || HEX_COLOR_RE.test(gameForm.value.color),
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

// --- IGDB metadata autofill ---
const igdbLookupOpen = ref(false)

// Captured from last applied IGDB result so user can re-import assets without re-running the lookup flow.
const igdbAssetLinks = ref<{
  igdb_id: number
  igdb_url: string
  cover_url: string | null
  background_url: string | null
} | null>(null)

const importingAllIgdbAssets = ref(false)
async function importAllIgdbAssets() {
  if (!igdbAssetLinks.value)
    return
  importingAllIgdbAssets.value = true
  try {
    await Promise.all([
      igdbAssetLinks.value.cover_url && !assetsUrl.value.cover
        ? importRemoteAsset('cover', igdbAssetLinks.value.cover_url)
        : Promise.resolve(),
      igdbAssetLinks.value.background_url && !assetsUrl.value.background
        ? importRemoteAsset('background', igdbAssetLinks.value.background_url)
        : Promise.resolve(),
    ])
  }
  finally {
    importingAllIgdbAssets.value = false
  }
}

function applyIgdbMetadata(payload: IgdbGameDetails & { _overwrite?: boolean }) {
  const overwrite = payload._overwrite ?? false

  // Capture asset links so user can re-import without re-running the lookup.
  igdbAssetLinks.value = {
    igdb_id: payload.igdb_id,
    igdb_url: payload.igdb_url ?? `https://www.igdb.com/games/${payload.igdb_id}`,
    cover_url: payload.cover_url,
    background_url: payload.background_url,
  }

  // name - only fill when empty
  if (!gameForm.value.name.trim())
    gameForm.value.name = payload.name

  // shorthand - suggest only if not manually set and name was just filled
  if (!shorthandManuallySet.value && !gameForm.value.shorthand.trim())
    gameForm.value.shorthand = payload.acronym?.toLowerCase() ?? suggestShorthand(payload.name)

  // markdown body - summary + storyline
  if (overwrite || !gameForm.value.markdown.trim()) {
    const parts = [payload.summary, payload.storyline].filter(Boolean)
    gameForm.value.markdown = parts.join('\n\n')
  }

  // release_date
  if (overwrite || !gameForm.value.release_date.trim())
    gameForm.value.release_date = payload.release_date ?? ''

  // website
  if (overwrite || !gameForm.value.website.trim())
    gameForm.value.website = payload.website ?? ''

  // steam_id
  if (payload.steam_id && (overwrite || !gameForm.value.steam_id.trim()))
    gameForm.value.steam_id = payload.steam_id

  // genre_tags - always merge (dedupe case-insensitively); overwrite replaces entirely
  const incomingTags = payload.genre_tags.map(t => sanitizeTag(t))
  if (overwrite) {
    gameForm.value.genre_tags = incomingTags
  }
  else {
    const existing = new Set(gameForm.value.genre_tags.map(t => t.toLowerCase()))
    const merged = [...gameForm.value.genre_tags]
    for (const tag of incomingTags) {
      if (!existing.has(tag))
        merged.push(tag)
    }
    gameForm.value.genre_tags = merged
  }

  // multiplayer_modes - same merge logic
  const incomingModes = multiplayerModeOptions.filter(o => payload.multiplayer_modes.includes(o.value))
  if (overwrite) {
    gameForm.value.multiplayer_modes = incomingModes
  }
  else {
    const existing = new Set((gameForm.value.multiplayer_modes ?? []).map(o => o.value))
    const merged = [...(gameForm.value.multiplayer_modes ?? [])]
    for (const mode of incomingModes) {
      if (!existing.has(mode.value))
        merged.push(mode)
    }
    gameForm.value.multiplayer_modes = merged
  }

  // Import cover and background if not already set
  if (payload.cover_url && !assetsUrl.value.cover && gameForm.value.shorthand)
    importRemoteAsset('cover', payload.cover_url)

  if (payload.background_url && !assetsUrl.value.background && gameForm.value.shorthand)
    importRemoteAsset('background', payload.background_url)
}

// Generic remote URL -> game asset importer (shared by Steam and IGDB flows)
async function importRemoteAsset(assetType: 'icon' | 'cover' | 'background', url: string) {
  const resp = await fetch(url)
  if (!resp.ok)
    return
  const blob = await resp.blob()
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
        multiplayer_modes: multiplayerModeOptions.filter(o => (newGame.multiplayer_modes ?? []).includes(o.value)),
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

// VUI <Select show-clear> sets the model to undefined when cleared - coerce back to []
const multiplayerModesModel = computed<SelectOption[]>({
  get: () => gameForm.value.multiplayer_modes ?? [],
  set: (val) => { gameForm.value.multiplayer_modes = val ?? [] },
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
  igdbAssetLinks.value = null
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
    multiplayer_modes: gameForm.value.multiplayer_modes?.length ? gameForm.value.multiplayer_modes.map(o => o.value) : null,
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
      <Flex x-between y-center expand>
        <Flex column :gap="0">
          <h4>{{ props.isEditMode ? 'Edit Game' : 'Add Game' }}</h4>
          <p v-if="props.isEditMode && props.game" class="text-color-light text-xs">
            {{ props.game.name }}
          </p>
        </Flex>
        <Tooltip>
          <Button
            square
            :disabled="!gameForm.name.trim()"
            @click="igdbLookupOpen = true"
          >
            <Icon name="ph:magnifying-glass" />
          </Button>
          <template #tooltip>
            <p>Lookup on IGDB</p>
          </template>
        </Tooltip>
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
          always-show-expand-button
        />

        <!-- Genre tags -->
        <TagInput
          v-model="gameForm.genre_tags"
          label="Genre Tags"
          placeholder="e.g. FPS, Survival, Co-op"
        />

        <!-- Multiplayer modes -->
        <Flex expand>
          <Select
            v-model="multiplayerModesModel"
            :options="multiplayerModeOptions"
            label="Multiplayer Modes"
            placeholder="Select multiplayer modes (optional)"
            show-clear
            :single="false"
          />
        </Flex>

        <!-- Accent color -->
        <ColorPicker
          v-model="gameForm.color"
          label="Accent Color"
          stacked
          clearable
          :error="validation.color ? undefined : 'Must be a valid hex color (e.g. #ff0000)'"
        />

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
          <Flex gap="xs" y-center>
            <Dropdown expand>
              <template #trigger="{ toggle, isOpen: dropdownOpen }">
                <Button expand outline @click="toggle">
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
              square
              class="game-form__topic-clear"
              @click="gameForm.discussion_topic_id = ''"
            >
              <Icon name="ph:x" />
            </Button>
          </Flex>
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
                  variant="fill"
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
                    outline
                    @click="toggle()"
                  >
                    <Icon name="ph:steam-logo" />
                    <template #end>
                      <Icon name="ph:caret-down" size="12" />
                    </template>
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

            <ButtonGroup v-if="igdbAssetLinks">
              <Tooltip>
                <Button
                  variant="fill"
                  square
                  :loading="importingAllIgdbAssets"
                  @click="importAllIgdbAssets"
                >
                  <Icon name="ph:download-simple" />
                </Button>
                <template #tooltip>
                  <p>Import all assets from IGDB</p>
                </template>
              </Tooltip>

              <Dropdown placement="bottom-end">
                <template #trigger="{ toggle }">
                  <Button
                    outline
                    @click="toggle()"
                  >
                    <Icon name="ph:game-controller" />
                    <template #end>
                      <Icon name="ph:caret-down" size="12" />
                    </template>
                  </Button>
                </template>

                <DropdownTitle>
                  IGDB Assets
                </DropdownTitle>
                <DropdownItem icon="ph:link" @click="openExternalLink(igdbAssetLinks.igdb_url)">
                  IGDB page
                </DropdownItem>
                <DropdownItem v-if="igdbAssetLinks.cover_url" icon="ph:portrait" @click="openExternalLink(igdbAssetLinks.cover_url!)">
                  Cover
                </DropdownItem>
                <DropdownItem v-if="igdbAssetLinks.background_url" icon="ph:panorama" @click="openExternalLink(igdbAssetLinks.background_url!)">
                  Background (artwork)
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

    <!-- IGDB Metadata Lookup Modal -->
    <IGDBLookupModal
      v-model:open="igdbLookupOpen"
      :initial-name="gameForm.name"
      :steam-id="steamId || undefined"
      @apply="applyIgdbMetadata"
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
