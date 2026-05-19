<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Button, Card, Flex, Sheet } from '@dolanske/vui'

import { computed, ref, watch } from 'vue'
import DetailRow from '@/components/Admin/Shared/DetailRow.vue'
import DetailTable from '@/components/Admin/Shared/DetailTable.vue'
import ChartActivityHistogramControls from '@/components/Shared/Charts/ChartActivityHistogramControls.vue'
import ChartGameserversPlayers from '@/components/Shared/Charts/ChartGameserversPlayers.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import CopyValue from '@/components/Shared/CopyValue.vue'
import GameIcon from '@/components/Shared/GameIcon.vue'
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
        <DetailTable>
          <template #header>
            <Icon name="ph:game-controller" />
            <h6>Overview</h6>
          </template>
          <DetailRow label="ID">
            <CopyValue :text="String(props.gameserver.id)" link />
          </DetailRow>
          <DetailRow label="Game">
            <NuxtLink
              v-if="props.gameserver.game?.id"
              :to="`/admin/games?game=${props.gameserver.game.id}`"
              class="text-s text-color-accent"
              style="display:inline-flex; align-items:center; gap:var(--space-xs)"
            >
              <GameIcon
                v-if="props.gameserver.game"
                :game="props.gameserver.game as Tables<'games'>"
                size="xs"
                :show-fallback="false"
              />
              <span class="text-s">{{ props.gameserver.game_name || props.gameserver.game?.name || 'Unknown' }}</span>
            </NuxtLink>
            <span v-else class="text-s">{{ props.gameserver.game_name || props.gameserver.game?.name || 'Unknown' }}</span>
          </DetailRow>
          <DetailRow label="Container">
            <NuxtLink
              v-if="props.gameserver.container"
              :to="`/admin/network?tab=Containers&container=${encodeURIComponent(props.gameserver.container)}`"
            >
              <Badge variant="accent" size="m" outline>
                {{ props.gameserver.container }}
              </Badge>
            </NuxtLink>
            <Badge v-else variant="neutral" size="m">
              Not linked
            </Badge>
          </DetailRow>
          <DetailRow label="Region">
            <RegionIndicator :region="props.gameserver.region" show-label />
          </DetailRow>
          <DetailRow label="Administrator">
            <UserLink v-if="props.gameserver.administrator" :user-id="props.gameserver.administrator" class="text-s" show-avatar />
            <span v-else class="gameserver-details__not-assigned">Not Assigned</span>
          </DetailRow>
        </DetailTable>

        <!-- Network Details -->
        <DetailTable>
          <template #header>
            <Icon name="ph:network" />
            <h6>Network Details</h6>
          </template>
          <DetailRow label="Addresses">
            <template v-if="props.gameserver.addresses && props.gameserver.addresses.length">
              <code v-for="address in props.gameserver.addresses" :key="address" class="text-s">{{ address }}</code>
            </template>
            <span v-else class="text-s">None configured</span>
          </DetailRow>
          <DetailRow label="Port">
            <code v-if="props.gameserver.port">{{ props.gameserver.port }}</code>
            <span v-else class="text-s">Not specified</span>
          </DetailRow>
          <DetailRow label="Query Protocol">
            <Badge v-if="props.gameserver.query_protocol" variant="neutral" size="s" filled>
              {{ props.gameserver.query_protocol.toUpperCase() }}
            </Badge>
            <span v-else class="text-s">None</span>
          </DetailRow>
          <DetailRow label="Query Port">
            <code v-if="props.gameserver.query_protocol && (props.gameserver.query_port ?? props.gameserver.port)">{{ props.gameserver.query_port ?? props.gameserver.port }}</code>
            <code v-else>{{ props.gameserver.query_protocol ? 'not specified' : 'n/a' }}</code>
          </DetailRow>
        </DetailTable>

        <!-- Activity (only for servers with query support) -->
        <Card v-if="props.gameserver.query_protocol != null" separators class="card-bg">
          <template #header>
            <Flex y-center gap="xs">
              <Icon name="ph:chart-bar" />
              <h6>Activity</h6>
            </Flex>
          </template>
          <ChartActivityHistogramControls :series="['gameserversPlayers']" :server-id="props.gameserver.id">
            <template #default="{ period, window, utc, color }">
              <ChartGameserversPlayers :period :window :utc :color :server-id="props.gameserver.id" compact />
            </template>
          </ChartActivityHistogramControls>
        </Card>

        <DetailTable v-if="props.gameserver.description">
          <template #header>
            <Icon name="ph:text-align-left" />
            <h6>Description</h6>
          </template>
          <p class="gameserver-details__description">
            {{ props.gameserver.description }}
          </p>
        </DetailTable>

        <!-- Markdown Content -->
        <DetailTable v-if="props.gameserver.markdown">
          <template #header>
            <Icon name="ph:article" />
            <h6>Markdown</h6>
          </template>
          <MarkdownRenderer :md="props.gameserver.markdown" class="gameserver-details__markdown-content" />
        </DetailTable>

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

  &__description {
    padding: var(--space-m);
  }

  &__markdown-content {
    padding: var(--space-m);

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
