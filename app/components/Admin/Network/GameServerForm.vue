<script setup lang="ts">
import type { GameServerDetailsFormState } from '@/lib/gameservers'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.overrides'
import type { Json } from '@/types/database.types'
import { Badge, Button, Flex, Input, Sheet, Switch, Tooltip } from '@dolanske/vui'
import { computed, onMounted, ref, watch } from 'vue'
import GameServerDetailsFields from '@/components/GameServers/GameServerDetailsFields.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import ExpandableSelect from '@/components/Shared/ExpandableSelect.vue'
import GameSelect from '@/components/Shared/GameSelect.vue'
import ProfileSelect from '@/components/Shared/ProfileSelect.vue'
import { gameServerDetailsPayload } from '@/lib/gameservers'

const props = defineProps<{
  gameserver: QueryGameserver | null
  isEditMode: boolean
}>()

const emit = defineEmits(['save', 'delete'])

const formFieldsRef = ref<InstanceType<typeof GameServerDetailsFields> | null>(null)

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
  connect_command: string | null
  query_protocol: string | null
  query_port: number | null
  query_options: Json | null
  region: 'eu' | 'na' | 'all' | null
}

interface SelectOption {
  label: string
  value: string
}

const isOpen = defineModel<boolean>('isOpen')

const supabase = useSupabaseClient()

const gameserverForm = ref({
  name: '',
  description: '',
  markdown: '',
  region: null as Tables<'network_gameservers'>['region'],
  addresses: [] as string[],
  port: '',
  connect_command: '',
  query_protocol: null as string | null,
  query_port: '' as string,
  game: null as number | null,
  container: null as string | null,
  administrator: null as string | null, // UUID of the administrator
})

// Addresses and content live in GameServerDetailsFields, shared with the quick
// edit on the server page. This bridges them onto gameserverForm.
const detailsModel = computed<GameServerDetailsFormState>({
  get: () => ({
    addresses: gameserverForm.value.addresses,
    description: gameserverForm.value.description,
    markdown: gameserverForm.value.markdown,
  }),
  set: (value) => {
    Object.assign(gameserverForm.value, value)
  },
})

// The query secret (Factorio's RCON password, Trackmania's User password) lives
// in Vault via set/get_gameserver_query_secret and never touches the row.
// factorioUseLua is non-secret config kept in query_options.
const factorioUseLua = ref(false)
const querySecret = ref('')
const querySecretExists = ref(false)
const clearQuerySecret = ref(false)

// Protocols that log in with a per-server secret
const secretProtocols = ['factorio', 'trackmania']
const usesQuerySecret = computed(() => secretProtocols.includes(gameserverForm.value.query_protocol ?? ''))

const showDeleteConfirm = ref(false)

const saveLoading = ref(false)

const loadingContainers = ref(true)

// Games load through a debounced server-side search.
const games = ref<Tables<'games'>[]>([])
const gamesLoading = ref(false)
let gameSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null

async function searchGames(query: string) {
  gamesLoading.value = true
  try {
    let req = supabase
      .from('games')
      .select('*')
      .order('name')
      .limit(30)

    if (query.trim()) {
      req = req.or(`name.ilike.%${query.trim()}%,shorthand.ilike.%${query.trim()}%`)
    }

    const { data, error } = await req
    if (error)
      throw error

    games.value = data ?? []
  }
  catch (err) {
    console.error('GameServerForm: failed to fetch games', err)
  }
  finally {
    gamesLoading.value = false
  }
}

function debouncedSearchGames(query: string) {
  if (gameSearchDebounceTimer !== null)
    clearTimeout(gameSearchDebounceTimer)
  gameSearchDebounceTimer = setTimeout(() => {
    searchGames(query)
  }, 300)
}

const containers = ref<Tables<'network_containers'>[]>([])

const queryProtocolOptions = [
  { label: 'Source (A2S)', value: 'source' },
  { label: 'Minecraft (Query)', value: 'minecraft' },
  { label: 'GameSpy v1 (UT99/UT2004)', value: 'gamespy1' },
  { label: 'Satisfactory (status only)', value: 'satisfactory' },
  { label: 'Factorio (RCON)', value: 'factorio' },
  { label: 'Trackmania (GBXRemote)', value: 'trackmania' },
]

const regionOptions = [
  { label: 'Europe', value: 'eu' },
  { label: 'North America', value: 'na' },
  { label: 'Multi-Region', value: 'all' },
]

const containerOptions = computed(() =>
  containers.value.map(container => ({
    label: container.name,
    value: container.name,
  })),
)

// Bridge GameSelect (multi) to single-game form field: pick newly added id, or null when cleared
const selectedGameIds = computed(() => gameserverForm.value.game ? [gameserverForm.value.game] : [])
function onGameSelect(ids: number[]) {
  const next = ids.find(id => id !== gameserverForm.value.game)
  gameserverForm.value.game = next ?? null
}

const selectedRegionComputed = computed({
  get: () => {
    if (!gameserverForm.value.region)
      return []

    const option = regionOptions.find(opt => opt.value === gameserverForm.value.region)
    return option ? [option] : []
  },
  set: (value: SelectOption[] | null | undefined) => {
    gameserverForm.value.region = (value && value.length > 0) ? value[0]!.value as Tables<'network_gameservers'>['region'] : null
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
    gameserverForm.value.container = (value && value.length > 0) ? value[0]!.value : null
  },
})

const selectedQueryProtocolComputed = computed({
  get: () => {
    if (!gameserverForm.value.query_protocol)
      return []

    const option = queryProtocolOptions.find(opt => opt.value === gameserverForm.value.query_protocol)
    return option ? [option] : []
  },
  set: (value: SelectOption[] | null | undefined) => {
    gameserverForm.value.query_protocol = (value && value.length > 0) ? value[0]!.value : null

    if (!gameserverForm.value.query_protocol)
      gameserverForm.value.query_port = ''

    // Factorio-only field is meaningless for other protocols
    if (gameserverForm.value.query_protocol !== 'factorio')
      factorioUseLua.value = false

    // Secret input only applies to protocols that log in
    if (!usesQuerySecret.value) {
      querySecret.value = ''
      clearQuerySecret.value = false
    }
  },
})

const validation = computed(() => ({
  name: !!gameserverForm.value.name.trim(),
}))

const isValid = computed(() => Object.values(validation.value).every(Boolean))

// Check whether a Vault query secret exists for this gameserver (without
// revealing it) so the form can show stored-state and the right placeholder.
async function loadQuerySecretState(gameserverId: number) {
  try {
    const { data, error } = await supabase.rpc('has_gameserver_query_secret', {
      p_gameserver_id: gameserverId,
    })
    if (error)
      throw error

    querySecretExists.value = data === true
  }
  catch (err) {
    console.error('GameServerForm: failed to check query secret state', err)
    querySecretExists.value = false
  }
}

async function fetchDropdownData() {
  loadingContainers.value = true
  try {
    const { data: containersData, error: containersError } = await supabase
      .from('network_containers')
      .select('*')
      .order('name')

    if (containersError)
      throw containersError

    containers.value = containersData || []
  }
  catch (error) {
    console.error('Error fetching dropdown data:', error)
  }
  finally {
    loadingContainers.value = false
  }
}

// Seed the form from a gameserver row, or wipe it back to defaults for a new one
function applyGameserver(newGameserver: QueryGameserver | null) {
  if (newGameserver) {
    gameserverForm.value = {
      name: newGameserver.name || '',
      description: newGameserver.description || '',
      markdown: newGameserver.markdown || '',
      region: newGameserver.region,
      addresses: newGameserver.addresses || [],
      port: newGameserver.port || '',
      connect_command: newGameserver.connect_command || '',
      query_protocol: newGameserver.query_protocol,
      query_port: newGameserver.query_port?.toString() || '',
      game: newGameserver.game?.id || null,
      container: newGameserver.container,
      administrator: newGameserver.administrator,
    }

    // Reset query fields, then hydrate from the row / Vault state.
    const queryOptions = newGameserver.query_options as { factorioUseLua?: boolean } | null
    factorioUseLua.value = queryOptions?.factorioUseLua ?? false
    querySecret.value = ''
    clearQuerySecret.value = false
    querySecretExists.value = false
    if (secretProtocols.includes(newGameserver.query_protocol ?? ''))
      void loadQuerySecretState(newGameserver.id)
  }
  else {
    gameserverForm.value = {
      name: '',
      description: '',
      markdown: '',
      region: null,
      addresses: [],
      port: '',
      connect_command: '',
      query_protocol: null,
      query_port: '',
      game: null,
      container: null,
      administrator: null,
    }
    factorioUseLua.value = false
    querySecret.value = ''
    clearQuerySecret.value = false
    querySecretExists.value = false
  }
}

watch(() => props.gameserver, applyGameserver, { immediate: true })

function handleClose() {
  isOpen.value = false
}

watch(isOpen, (open) => {
  if (!open) {
    saveLoading.value = false
    return
  }

  // The sheet stays mounted, so a second "Add" hands us the same null prop and
  // the prop watcher never fires. Re-seed on every open instead, and pull
  // containers again in case they changed while the sheet was closed.
  applyGameserver(props.gameserver)
  fetchDropdownData()

  if (games.value.length === 0)
    searchGames('')
})

async function handleSubmit() {
  if (!isValid.value)
    return

  // Flush pending blob-placeholder media first, or blob: URLs get persisted and
  // render as missing media. The editor shows its own error toast, so just abort.
  const uploaded = await formFieldsRef.value?.flushPendingUploads()
  if (uploaded === false)
    return

  const gameserverData: TablesInsert<'network_gameservers'> | TablesUpdate<'network_gameservers'> = {
    ...gameServerDetailsPayload(detailsModel.value),
    name: gameserverForm.value.name,
    region: gameserverForm.value.region,
    port: gameserverForm.value.port || null,
    connect_command: gameserverForm.value.connect_command.trim() || null,
    query_protocol: gameserverForm.value.query_protocol as TablesInsert<'network_gameservers'>['query_protocol'],
    query_port: gameserverForm.value.query_port ? Number(gameserverForm.value.query_port) : null,
    query_options: gameserverForm.value.query_protocol === 'factorio'
      ? { factorioUseLua: factorioUseLua.value }
      : null,
    game: gameserverForm.value.game,
    container: gameserverForm.value.container,
    administrator: gameserverForm.value.administrator,
  }

  // Secret handling is delegated to the parent (it owns insert/update and the
  // resulting id).
  const trimmedSecret = querySecret.value.trim()
  const secretPayload = {
    secret: usesQuerySecret.value && trimmedSecret ? trimmedSecret : null,
    clear: usesQuerySecret.value && clearQuerySecret.value,
  }

  saveLoading.value = true
  emit('save', gameserverData, secretPayload)
}

function handleDelete() {
  if (!props.gameserver)
    return

  showDeleteConfirm.value = true
}

function confirmDelete() {
  if (!props.gameserver)
    return

  emit('delete', props.gameserver.id)
}

onMounted(() => {
  fetchDropdownData()
  searchGames('')
})
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
        <h4>{{ props.isEditMode ? 'Edit Game Server' : 'Add Game Server' }}</h4>
        <p v-if="props.isEditMode && props.gameserver" class="text-color-light text-xs">
          {{ props.gameserver.name }}
        </p>
      </Flex>
    </template>

    <Flex column gap="l" class="gameserver-form">
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

        <ExpandableSelect
          v-model="selectedRegionComputed"
          expand
          name="region"
          label="Region"
          placeholder="Select region"
          :options="regionOptions"
          show-clear
        />
      </Flex>

      <Flex column gap="m" expand>
        <h4>Configuration</h4>

        <Flex gap="m" wrap expand>
          <Flex column gap="s" expand>
            <div class="gameserver-form__label">
              Game
            </div>
            <GameSelect
              :model-value="selectedGameIds"
              :games="games"
              :loading="gamesLoading"
              :on-search="debouncedSearchGames"
              placeholder="Select game"
              expand
              @update:model-value="onGameSelect"
            />
          </Flex>

          <ExpandableSelect
            v-model="selectedContainerComputed"
            search
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

        <Flex gap="m" wrap expand>
          <Flex column gap="s" expand>
            <div class="gameserver-form__label">
              Administrator
            </div>
            <ProfileSelect
              v-model="gameserverForm.administrator"
              expand
              placeholder="Select administrator"
            />
          </Flex>

          <Input
            v-model="gameserverForm.port"
            expand
            name="port"
            label="Port"
            placeholder="Enter port (optional)"
          />
        </Flex>

        <Input
          v-model="gameserverForm.connect_command"
          expand
          name="connect_command"
          label="Connect Command Override"
          placeholder="Inherits the game default when empty"
          hint="Overrides the game's connect command for this server only, e.g. extra launch arguments. Tokens: {address} {port}. Not a place for secrets, this row is publicly readable."
        />

        <Flex gap="m" wrap expand>
          <ExpandableSelect
            v-model="selectedQueryProtocolComputed"
            expand
            name="query_protocol"
            label="Query Protocol"
            placeholder="None"
            :options="queryProtocolOptions"
            show-clear
          />

          <Input
            v-model="gameserverForm.query_port"
            expand
            name="query_port"
            label="Query Port"
            placeholder="Defaults to port if unset"
            :disabled="!gameserverForm.query_protocol"
            type="number"
          />
        </Flex>

        <!-- Query Port should be the RCON port (Factorio) or the xmlrpc_port (Trackmania). -->
        <Flex v-if="usesQuerySecret" column gap="s" expand>
          <Input
            v-model="querySecret"
            expand
            type="password"
            name="query_secret"
            :label="gameserverForm.query_protocol === 'factorio' ? 'RCON Password' : 'User Password'"
            :disabled="clearQuerySecret"
            :placeholder="querySecretExists ? 'Leave blank to keep current password' : (gameserverForm.query_protocol === 'factorio' ? 'Enter Factorio RCON password' : 'Enter the User level password from dedicated_cfg.txt')"
          />
          <Flex y-center gap="s" wrap>
            <Badge v-if="querySecretExists" variant="success">
              Secret stored
            </Badge>
            <Switch v-if="querySecretExists" v-model="clearQuerySecret" label="Remove stored secret on save" />
          </Flex>
          <Switch v-if="gameserverForm.query_protocol === 'factorio'" v-model="factorioUseLua" label="Use Lua command (also fetch player names + max players; disables save achievements)" />
        </Flex>
      </Flex>

      <GameServerDetailsFields
        ref="formFieldsRef"
        v-model="detailsModel"
        :gameserver-id="props.gameserver?.id"
      />
    </Flex>
    <template #footer>
      <Flex gap="xs" class="form-actions">
        <Button
          type="submit"
          variant="accent"
          :loading="saveLoading"
          :disabled="!isValid || saveLoading"
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
            <p>Delete game server</p>
          </template>
        </Tooltip>
      </Flex>
    </template>

    <ConfirmModal
      v-model:open="showDeleteConfirm"
      :confirm="confirmDelete"
      title="Confirm Delete Game Server"
      :description="`Are you sure you want to delete the game server '${props.gameserver?.name}'? This action cannot be undone.`"
      confirm-text="Delete"
      cancel-text="Cancel"
      :destructive="true"
    />
  </Sheet>
</template>

<style scoped lang="scss">
.gameserver-form {
  padding-bottom: var(--space);

  &__label {
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
  }
}

.form-actions {
  margin-top: var(--space);
}

.flex-1 {
  flex: 1;
}
</style>
