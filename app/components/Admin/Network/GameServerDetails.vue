<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Button, Card, Flex, Grid, Sheet } from '@dolanske/vui'

import { computed, ref, watch } from 'vue'
import GameIcon from '@/components/GameServers/GameIcon.vue'
import ChartActivityHistogramControls from '@/components/Shared/Charts/ChartActivityHistogramControls.vue'
import ChartGameserversPlayers from '@/components/Shared/Charts/ChartGameserversPlayers.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import MarkdownRenderer from '@/components/Shared/MarkdownRenderer.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import RegionIndicator from '@/components/Shared/RegionIndicator.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

type GameServerWithJoins = Omit<Tables<'network_gameservers'>, 'game'> & {
  game_name?: string
  game?: {
    id?: number | null
    name?: string | null
    shorthand?: string | null
  } | null
}

const props = defineProps<{
  gameserver: GameServerWithJoins | null
}>()

// Define emits
const emit = defineEmits(['edit', 'delete'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Get admin permissions
const { hasPermission } = useAdminPermissions()
const canUpdateGameservers = computed(() => hasPermission('network.update'))
const canDeleteGameservers = computed(() => hasPermission('network.delete'))
const showDeleteConfirm = ref(false)
const route = useRoute()
const isMobile = useBreakpoint('<s')

watch(
  () => [route.path, route.query.tab] as const,
  ([path, tab]) => {
    const tabValue = typeof tab === 'string'
      ? tab
      : Array.isArray(tab) && tab[0]
        ? tab[0]
        : ''
    const isInGameserversContext = path === '/admin/network' && tabValue === 'Gameservers'

    if (!isInGameserversContext && isOpen.value)
      isOpen.value = false
  },
)

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Handle edit button click
function handleEdit() {
  emit('edit', props.gameserver)
  isOpen.value = false
}

function handleDelete() {
  showDeleteConfirm.value = true
}

function confirmDelete() {
  if (!props.gameserver)
    return

  emit('delete', props.gameserver.id)
  showDeleteConfirm.value = false
  isOpen.value = false
}
</script>

<template>
  <Sheet
    :open="!!props.gameserver && isOpen"
    position="right"
    :card="{ separators: true }"
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex x-between y-center>
        <Flex column :gap="0">
          <h4>Game Server Details</h4>
          <p v-if="props.gameserver" class="text-color-light text-xs">
            <NuxtLink :to="`/servers/gameservers/${props.gameserver.id}`" target="_blank">
              {{ props.gameserver.name }}
            </NuxtLink>
          </p>
        </Flex>
        <Flex y-center gap="s">
          <Button
            v-if="props.gameserver && canDeleteGameservers && isMobile"
            variant="danger"
            square
            @click="handleDelete"
          >
            <Icon name="ph:trash" />
          </Button>
          <Button
            v-else-if="props.gameserver && canDeleteGameservers"
            variant="danger"
            @click="handleDelete"
          >
            <template #start>
              <Icon name="ph:trash" />
            </template>
            Delete
          </Button>
          <Button
            v-if="props.gameserver && canUpdateGameservers && isMobile"
            square
            @click="handleEdit"
          >
            <Icon name="ph:pencil" />
          </Button>
          <Button
            v-else-if="props.gameserver && canUpdateGameservers"
            @click="handleEdit"
          >
            <template #start>
              <Icon name="ph:pencil" />
            </template>
            Edit
          </Button>
        </Flex>
      </Flex>
    </template>

    <Flex v-if="props.gameserver" column gap="m" class="gameserver-details">
      <Flex column gap="m" expand>
        <!-- Basic info -->
        <Card>
          <Flex column gap="l" expand>
            <Grid expand :columns="2">
              <span class="text-color-light text-bold">ID:</span>
              <span>{{ props.gameserver.id }}</span>
            </Grid>

            <Grid expand :columns="2">
              <span class="text-color-light text-bold">Game:</span>
              <NuxtLink
                v-if="props.gameserver.game?.id"
                :to="`/admin/games?game=${props.gameserver.game.id}`"
                class="text-m text-color-accent"
              >
                <Flex gap="xs" y-center>
                  <GameIcon
                    v-if="props.gameserver.game"
                    :game="props.gameserver.game as Tables<'games'>"
                    size="xs"
                    :show-fallback="false"
                  />
                  <span>{{ props.gameserver.game_name || props.gameserver.game?.name || 'Unknown' }}</span>
                </Flex>
              </NuxtLink>
              <span v-else>{{ props.gameserver.game_name || props.gameserver.game?.name || 'Unknown' }}</span>
            </Grid>

            <Grid expand :columns="2">
              <span class="text-color-light text-bold">Container:</span>
              <Flex>
                <NuxtLink
                  v-if="props.gameserver.container"
                  :to="`/admin/network?tab=Containers&container=${encodeURIComponent(props.gameserver.container)}`"
                >
                  <Badge variant="accent" outline>
                    {{ props.gameserver.container }}
                  </Badge>
                </NuxtLink>
                <Badge v-else variant="neutral">
                  Not linked
                </Badge>
              </Flex>
            </Grid>

            <Grid expand :columns="2">
              <span class="text-color-light text-bold">Region:</span>
              <RegionIndicator :region="props.gameserver.region" show-label />
            </Grid>

            <Grid expand :columns="2">
              <span class="text-color-light text-bold">Administrator:</span>
              <div :class="{ 'gameserver-details__not-assigned': !props.gameserver.administrator }">
                <UserLink v-if="props.gameserver.administrator" :user-id="props.gameserver.administrator" class="text-m" show-avatar />
                <span v-else>Not Assigned</span>
              </div>
            </Grid>
          </Flex>
        </Card>

        <!-- Network Details -->
        <Card separators>
          <template #header>
            <h6>Network details</h6>
          </template>

          <Flex column gap="l" expand>
            <Grid expand :columns="2">
              <span class="text-color-light text-bold">Addresses:</span>
              <Flex v-if="props.gameserver.addresses && props.gameserver.addresses.length" gap="xs" wrap>
                <Badge v-for="address in props.gameserver.addresses" :key="address">
                  {{ address }}
                </Badge>
              </Flex>
              <span v-else>None configured</span>
            </Grid>

            <Grid expand :columns="2">
              <span class="text-color-light text-bold">Port:</span>
              <span><code v-if="props.gameserver.port">{{ props.gameserver.port }}</code>
                <span v-else>Not specified</span></span>
            </Grid>

            <Grid expand :columns="2">
              <span class="text-color-light text-bold">Query Protocol:</span>
              <Flex v-if="props.gameserver.query_protocol">
                <Badge>{{ props.gameserver.query_protocol.toUpperCase() }}</Badge>
              </Flex>
              <span v-else>None</span>
            </Grid>

            <Grid expand :columns="2">
              <span class="text-color-light text-bold">Query Port:</span>
              <span><code v-if="props.gameserver.query_protocol && (props.gameserver.query_port ?? props.gameserver.port)">{{ props.gameserver.query_port ?? props.gameserver.port }}</code>
                <code v-else>{{ props.gameserver.query_protocol ? 'not specified' : 'n/a' }}</code></span>
            </Grid>
          </Flex>
        </Card>

        <!-- Activity (only for servers with query support) -->
        <Card v-if="props.gameserver.query_protocol != null" separators>
          <template #header>
            <h6>Activity</h6>
          </template>

          <ChartActivityHistogramControls :series="['gameserversPlayers']" :server-id="props.gameserver.id">
            <template #default="{ period, window, utc, color }">
              <ChartGameserversPlayers :period :window :utc :color :server-id="props.gameserver.id" compact />
            </template>
          </ChartActivityHistogramControls>
        </Card>
        <Card v-if="props.gameserver.description" separators>
          <template #header>
            <h6>Description</h6>
          </template>

          <p>{{ props.gameserver.description }}</p>
        </Card>

        <!-- Markdown Content -->
        <Card v-if="props.gameserver.markdown" separators>
          <template #header>
            <h6>Markdown</h6>
          </template>

          <MarkdownRenderer :md="props.gameserver.markdown" class="gameserver-details__markdown-content" />
        </Card>

        <!-- Metadata -->
        <Metadata
          :created-at="props.gameserver.created_at"
          :created-by="props.gameserver.created_by"
          :modified-at="props.gameserver.modified_at"
          :modified-by="props.gameserver.modified_by"
        />
      </Flex>
    </Flex>

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

<style lang="scss" scoped>
.gameserver-details {
  padding-bottom: var(--space);

  &__metadata-by {
    font-size: var(--font-size-l);
    color: var(--color-text-light);
  }

  &__markdown {
    width: 100%;
  }

  &__markdown-skeleton {
    width: 100%;
  }

  &__markdown-content {
    h1 {
      margin-top: var(--space-s);
      font-size: var(--font-size-xxl);
    }

    h2 {
      margin-top: var(--space-s);
      font-size: var(--font-size-xxl);
    }
  }

  &__not-assigned {
    opacity: 0.5;
  }
}
</style>
