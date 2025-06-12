<script setup lang="ts">
import type { Tables, TablesInsert, TablesUpdate } from '~/types/database.types'
import { Button, Flex, Input, Select, Sheet, Textarea } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ConfirmModal from '../../Shared/ConfirmModal.vue'

// Interface for gameserver query result
interface QueryGameserver {
  addresses: string[] | null
  administrator: string | null
  container: string | null
  created_at: string
  created_by: string | null
  description: string | null
  game: { id: number, name: string | null, shorthand: string | null } | null
  id: number
  markdown: string | null
  modified_at: string | null
  modified_by: string | null
  name: string
  port: string | null
  region: 'eu' | 'na' | 'all' | null
}

// Interface for profile selection
interface ProfileSelect {
  id: string
  username: string
}

// Interface for Select options
interface SelectOption {
  label: string
  value: string
}

const props = defineProps<{
  gameserver: QueryGameserver | null
  isEditMode: boolean
}>()

// Define emits
const emit = defineEmits(['save', 'delete'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Setup Supabase client
const supabase = useSupabaseClient()

// Form state
const gameserverForm = ref({
  name: '',
  description: '',
  markdown: '',
  region: null as Tables<'gameservers'>['region'],
  addresses: [] as string[],
  port: '',
  game: null as number | null,
  container: null as string | null,
  administrator: null as string | null, // UUID of the administrator
})

// Address input for managing multiple addresses
const newAddress = ref('')

// State for delete confirmation modal
const showDeleteConfirm = ref(false)

// Loading states for dropdowns
const loadingGames = ref(true)
const loadingContainers = ref(true)
const loadingProfiles = ref(true)

// Options for dropdowns
const games = ref<Tables<'games'>[]>([])
const containers = ref<Tables<'containers'>[]>([])
const profiles = ref<ProfileSelect[]>([])

// Region options
const regionOptions = [
  { label: 'Europe', value: 'eu' },
  { label: 'North America', value: 'na' },
  { label: 'Multi-Region', value: 'all' },
]

// Computed options for selects
const gameOptions = computed(() =>
  games.value.map(game => ({
    label: game.name || 'Unknown Game',
    value: game.id,
  })),
)

const containerOptions = computed(() =>
  containers.value.map(container => ({
    label: container.name,
    value: container.name,
  })),
)

const profileOptions = computed(() =>
  profiles.value.map(profile => ({
    label: profile.username || 'Unknown User',
    value: profile.id,
  })),
)

// Computed properties to handle conversion between form values and select options
const selectedRegionComputed = computed({
  get: () => {
    if (!gameserverForm.value.region)
      return []
    const option = regionOptions.find(opt => opt.value === gameserverForm.value.region)
    return option ? [option] : []
  },
  set: (value: SelectOption[] | null | undefined) => {
    gameserverForm.value.region = (value && value.length > 0) ? value[0].value as Tables<'gameservers'>['region'] : null
  },
})

const selectedGameComputed = computed({
  get: () => {
    if (!gameserverForm.value.game)
      return []
    const option = gameOptions.value.find(opt => opt.value === gameserverForm.value.game)
    return option ? [option] : []
  },
  set: (value: SelectOption[] | null | undefined) => {
    gameserverForm.value.game = (value && value.length > 0) ? Number(value[0].value) : null
  },
})

const selectedContainerComputed = computed({
  get: () => {
    if (!gameserverForm.value.container)
      return []
    const option = containerOptions.value.find(opt => opt.value === gameserverForm.value.container)
    return option ? [option] : []
  },
  set: (value: SelectOption[] | null | undefined) => {
    gameserverForm.value.container = (value && value.length > 0) ? value[0].value : null
  },
})

const selectedAdministratorComputed = computed({
  get: () => {
    if (!gameserverForm.value.administrator)
      return []
    const option = profileOptions.value.find(opt => opt.value === gameserverForm.value.administrator)
    return option ? [option] : []
  },
  set: (value: SelectOption[] | null | undefined) => {
    gameserverForm.value.administrator = (value && value.length > 0) ? value[0].value : null
  },
})

// Form validation
const validation = computed(() => ({
  name: !!gameserverForm.value.name.trim(),
}))

const isValid = computed(() => Object.values(validation.value).every(Boolean))

// Fetch dropdown data
async function fetchDropdownData() {
  try {
    // Fetch games
    const { data: gamesData, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .order('name')

    if (gamesError)
      throw gamesError
    games.value = gamesData || []
    loadingGames.value = false

    // Fetch containers
    const { data: containersData, error: containersError } = await supabase
      .from('containers')
      .select('*')
      .order('name')

    if (containersError)
      throw containersError
    containers.value = containersData || []
    loadingContainers.value = false

    // Fetch profiles
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username')
      .order('username')

    if (profilesError)
      throw profilesError
    profiles.value = profilesData || []
    loadingProfiles.value = false
  }
  catch (error) {
    console.error('Error fetching dropdown data:', error)
  }
}

// Update form data when gameserver prop changes
watch(
  () => props.gameserver,
  (newGameserver) => {
    if (newGameserver) {
      gameserverForm.value = {
        name: newGameserver.name || '',
        description: newGameserver.description || '',
        markdown: newGameserver.markdown || '',
        region: newGameserver.region,
        addresses: newGameserver.addresses || [],
        port: newGameserver.port || '',
        game: newGameserver.game?.id || null,
        container: newGameserver.container,
        administrator: newGameserver.administrator,
      }
    }
    else {
      // Reset form for new gameserver
      gameserverForm.value = {
        name: '',
        description: '',
        markdown: '',
        region: null,
        addresses: [],
        port: '',
        game: null,
        container: null,
        administrator: null,
      }
    }
  },
  { immediate: true },
)

// Handle adding a new address
function addAddress() {
  if (newAddress.value.trim()) {
    const newAddressValue = newAddress.value.trim()
    gameserverForm.value.addresses = [...gameserverForm.value.addresses, newAddressValue]
    newAddress.value = ''
  }
}

// Handle removing an address
function removeAddress(index: number) {
  gameserverForm.value.addresses = gameserverForm.value.addresses.filter((_, i) => i !== index)
}

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Handle form submission
function handleSubmit() {
  if (!isValid.value)
    return

  // Prepare the data to save
  const gameserverData: TablesInsert<'gameservers'> | TablesUpdate<'gameservers'> = {
    name: gameserverForm.value.name,
    description: gameserverForm.value.description || null,
    markdown: gameserverForm.value.markdown || null,
    region: gameserverForm.value.region,
    addresses: gameserverForm.value.addresses.length > 0 ? gameserverForm.value.addresses : null,
    port: gameserverForm.value.port || null,
    game: gameserverForm.value.game,
    container: gameserverForm.value.container,
    administrator: gameserverForm.value.administrator,
  }

  emit('save', gameserverData)
}

// Open confirmation modal for deletion
function handleDelete() {
  if (!props.gameserver)
    return
  showDeleteConfirm.value = true
}

// Perform actual deletion when confirmed
function confirmDelete() {
  if (!props.gameserver)
    return
  emit('delete', props.gameserver.id)
}

// Fetch dropdown data when component mounts
onMounted(fetchDropdownData)
</script>

<template>
  <Sheet
    :open="isOpen"
    position="right"
    separator
    :size="700"
    @close="handleClose"
  >
    <template #header>
      <Flex column :gap="0">
        <h4>{{ props.isEditMode ? 'Edit Game Server' : 'Add Game Server' }}</h4>
        <span v-if="props.isEditMode && props.gameserver" class="color-text-light text-xxs">
          {{ props.gameserver.name }}
        </span>
      </Flex>
    </template>

    <!-- Gameserver Info Section -->
    <Flex column gap="l" class="gameserver-form">
      <!-- Basic Information -->
      <Flex column gap="m" expand>
        <h4>Basic Information</h4>

        <Input
          v-model="gameserverForm.name"
          expand
          name="name"
          label="Name"
          required
          :valid="validation.name"
          error="Game server name is required"
          placeholder="Enter game server name"
        />

        <Textarea
          v-model="gameserverForm.description"
          expand
          name="description"
          label="Description"
          placeholder="Enter game server description (optional)"
          :rows="3"
        />

        <!-- Markdown Content -->
        <Textarea
          v-model="gameserverForm.markdown"
          expand
          name="markdown"
          label="Markdown"
          placeholder="Enter markdown content (optional)"
          :rows="9"
        />

        <Select
          v-model="selectedRegionComputed"
          expand
          name="region"
          label="Region"
          placeholder="Select region"
          :options="regionOptions"
          show-clear
        />
      </Flex>

      <!-- Game and Container Selection -->
      <Flex column gap="m" expand>
        <h4>Configuration</h4>

        <!-- First row: Game and Container -->
        <Flex gap="m" wrap>
          <Select
            v-model="selectedGameComputed"
            expand
            name="game"
            label="Game"
            placeholder="Select game"
            :options="gameOptions"
            :loading="loadingGames"
            searchable
            show-clear
          />

          <Select
            v-model="selectedContainerComputed"
            expand
            name="container"
            label="Container"
            placeholder="Select container"
            :options="containerOptions"
            :loading="loadingContainers"
            searchable
            show-clear
          />
        </Flex>

        <!-- Second row: Administrator and Port -->
        <Flex gap="m" wrap>
          <Select
            v-model="selectedAdministratorComputed"
            expand
            name="administrator"
            label="Administrator"
            placeholder="Select administrator"
            :options="profileOptions"
            :loading="loadingProfiles"
            searchable
            show-clear
          />

          <Input
            v-model="gameserverForm.port"
            expand
            name="port"
            label="Port"
            placeholder="Enter port (optional)"
          />
        </Flex>
      </Flex>

      <!-- Addresses Section -->
      <Flex column gap="m" expand>
        <h4>Addresses</h4>

        <!-- Add new address -->
        <Flex gap="xs">
          <Input
            v-model="newAddress"
            expand
            placeholder="Enter server address"
            @keyup.enter="addAddress"
          />
          <Button :disabled="!newAddress.trim()" @click.stop="addAddress">
            <template #start>
              <Icon name="ph:plus" />
            </template>
            Add
          </Button>
        </Flex>

        <!-- Address list -->
        <Flex v-if="gameserverForm.addresses.length > 0" gap="xs" wrap>
          <Flex
            v-for="(address, index) in gameserverForm.addresses"
            :key="`address-${index}`"
            gap="xs"
            y-center
            class="address-item"
          >
            <span class="flex-1 address-text">{{ address }}</span>
            <Button
              size="s"
              variant="danger"
              square
              @click.stop="removeAddress(index)"
            >
              <Icon name="ph:trash" />
            </Button>
          </Flex>
        </Flex>
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
          data-title-left="Delete game server"
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
      title="Confirm Delete Game Server"
      :description="`Are you sure you want to delete the game server '${props.gameserver?.name}'? This action cannot be undone.`"
      confirm-text="Delete"
      cancel-text="Cancel"
      :destructive="true"
    />
  </Sheet>
</template>

<style scoped>
.gameserver-form {
  padding-bottom: var(--space);
}

.form-actions {
  margin-top: var(--space);
}

.flex-1 {
  flex: 1;
}

.address-item {
  padding: var(--space-xs) var(--space-s);
  background-color: var(--color-bg-raised);
  border-radius: var(--border-radius-s);
  border: 1px solid var(--color-border);
}

.address-text {
  font-family: monospace;
  font-size: var(--font-size-s);
  color: var(--color-text);
}
</style>
