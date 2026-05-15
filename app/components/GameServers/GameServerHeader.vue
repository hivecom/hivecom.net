<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, BadgeGroup, Button, Flex, Tooltip } from '@dolanske/vui'
import GameIcon from '@/components/GameServers/GameIcon.vue'
import GameServerConnectButton from '@/components/GameServers/GameServerConnectButton.vue'
import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import GameDetailsModalTrigger from '@/components/Shared/GameDetailsModalTrigger.vue'
import RegionIndicator from '@/components/Shared/RegionIndicator.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useBreakpoint } from '@/lib/mediaQuery'
import UserLink from '../Shared/UserLink.vue'
import GameServerStats from './GameServerStats.vue'

const _props = defineProps<Props>()
const addresses = computed(() => _props.gameserver.addresses as string[] | null)

const { navigateToSignIn } = useAuthRedirect()

type ContainerWithServer = Tables<'network_containers'> & {
  server?: {
    docker_control?: boolean | null
    accessible?: boolean | null
  } | null
}

interface Props {
  gameserver: Tables<'network_gameservers'>
  game?: Tables<'games'> | null
  container?: ContainerWithServer | null
  // FIxme: these props are passed in, but unused
  state: string
  stateConfig: unknown // TODO: add type
}

// Get current user for authentication check
const user = useSupabaseUser()

// Complaint modal state
const showComplaintModal = ref(false)

// Handle complaint submission
function handleComplaintSubmit(_complaintData: { message: string }) {
  // Could show a success toast here in the future
  // For now, just handle the successful submission
}

function openComplaintModal() {
  // Check if user is authenticated
  if (!user.value) {
    // Redirect to sign-in page if not authenticated
    navigateToSignIn()
    return
  }

  showComplaintModal.value = true
}

const isMobile = useBreakpoint('<s')
const dockerControlEnabled = computed(() => _props.container?.server?.docker_control === true)
const dockerControlAccessible = computed(() => {
  if (!dockerControlEnabled.value)
    return false

  return _props.container?.server?.accessible === true
})

const { metrics, fetchMetrics } = useDataMetrics()

onMounted(() => {
  if (metrics.value === null)
    fetchMetrics()
})

const currentMap = computed<string | null>(() => {
  const detail = metrics.value?.gameservers.byServer[String(_props.gameserver.id)]
  if (detail?.protocol === 'source')
    return detail.data?.map ?? null
  return null
})
</script>

<template>
  <div class="gameserver-header">
    <!-- Title and actions row -->
    <Flex x-between align="start" gap="l" class="gameserver-header__title-row">
      <div class="gameserver-header__title-section">
        <Flex :gap="isMobile ? 'm' : 'l'" y-start class="gameserver-header__title-container">
          <GameDetailsModalTrigger
            v-if="game"
            v-slot="{ open }"
            :game-id="game.id"
          >
            <div class="gameserver-header__game-icon-wrapper">
              <button
                type="button"
                class="gameserver-header__game-icon-button"
                :aria-label="`Open details for ${game.name ?? 'game'}`"
                @click.stop="open"
              >
                <GameIcon :game="game" :size="isMobile ? 'l' : 'xl'" />
              </button>
              <Button
                v-if="isMobile"
                variant="danger"
                size="s"
                square
                class="gameserver-header__mobile-report"
                aria-label="Report Issue"
                @click="openComplaintModal"
              >
                <Icon name="ph:flag" />
              </Button>
            </div>
          </GameDetailsModalTrigger>
          <div>
            <h1 class="gameserver-header__title">
              {{ gameserver.name }}
            </h1>
            <!-- Description -->
            <p v-if="gameserver.description" class="gameserver-header__description">
              {{ gameserver.description }}
            </p>
          </div>
        </Flex>
      </div>

      <Flex :gap="4" class="gameserver-header__aside" y-start>
        <Button
          v-if="!isMobile"
          variant="danger"
          size="m"
          square
          aria-label="Report Issue"
          @click="openComplaintModal"
        >
          <Icon name="ph:flag" />
        </Button>

        <div v-if="!isMobile" class="gameserver-header__connect-button">
          <GameServerConnectButton
            :addresses="addresses"
            :port="gameserver.port"
            :game-shorthand="game?.shorthand ?? null"
            variant="accent"
            size="m"
          />
        </div>
      </Flex>
    </Flex>

    <Flex class="mb-m">
      <GameServerStats v-if="gameserver.query_protocol != null" :id="gameserver.id" />
    </Flex>

    <Flex y-start x-between gap="l" expand>
      <Flex column gap="xs" expand>
        <!-- Quick info badges and status -->
        <div class="gameserver-header__info-section">
          <!-- Status Information -->
          <Flex gap="m" wrap y-end>
            <div v-if="game" class="gameserver-header__status-item">
              <span class="gameserver-header__status-label">Game</span>
              <GameDetailsModalTrigger v-slot="{ open }" :game-id="game.id">
                <button
                  type="button"
                  class="gameserver-header__game-badge-button"
                  :aria-label="`Open details for ${game.name ?? 'game'}`"
                  @click.stop="open"
                >
                  <Badge>
                    <Icon name="ph:game-controller" />
                    {{ game.name }}
                  </Badge>
                </button>
              </GameDetailsModalTrigger>
            </div>

            <div v-if="gameserver.region" class="gameserver-header__status-item">
              <span class="gameserver-header__status-label">Region</span>
              <Badge v-if="gameserver.region" variant="neutral">
                <RegionIndicator :region="gameserver.region" show-label />
              </Badge>
            </div>

            <div v-if="isMobile && addresses && addresses.length > 0" class="gameserver-header__status-item">
              <span class="gameserver-header__status-label">Address{{ addresses.length > 1 ? 'es' : '' }}</span>
              <Flex gap="xs" wrap>
                <Badge v-for="addr in addresses" :key="addr" variant="neutral">
                  <Icon name="ph:link" />
                  {{ addr }}
                </Badge>
              </Flex>
            </div>

            <div v-if="container" class="gameserver-header__status-item">
              <span class="gameserver-header__status-label">Status</span>
              <BadgeGroup>
                <Tooltip placement="top" :disabled="!dockerControlEnabled || !dockerControlAccessible || !container.reported_at">
                  <template #tooltip>
                    <Flex column gap="xxs">
                      <span class="text-xs">Last reported</span>
                      <TimestampDate size="xs" :date="container.reported_at" :tooltip="false" />
                    </Flex>
                  </template>
                  <Badge
                    :variant="dockerControlEnabled && dockerControlAccessible ? (container.running ? 'success' : 'neutral') : 'neutral'"
                  >
                    <Icon
                      :name="dockerControlEnabled && dockerControlAccessible ? (container.running ? 'ph:check' : 'ph:x') : 'ph:question'"
                    />
                    Running
                  </Badge>
                </Tooltip>
                <Tooltip
                  v-if="dockerControlEnabled && dockerControlAccessible && container.healthy !== null && container.running"
                  placement="top"
                  :disabled="!container.reported_at"
                >
                  <template #tooltip>
                    <Flex column gap="xxs">
                      <span class="text-xs">Last reported</span>
                      <TimestampDate size="xs" :date="container.reported_at" :tooltip="false" />
                    </Flex>
                  </template>
                  <Badge :variant="container.healthy ? 'success' : 'warning'" :size="isMobile ? 's' : undefined">
                    <Icon :name="container.healthy ? 'ph:check' : 'ph:warning'" />
                    Healthy
                  </Badge>
                </Tooltip>
              </BadgeGroup>
            </div>

            <!-- Administrator -->
            <div v-if="gameserver.administrator" class="gameserver-header__status-item">
              <span class="gameserver-header__status-label">Admin</span>
              <Badge>
                <UserLink :user-id="gameserver.administrator" size="s" show-avatar public />
              </Badge>
            </div>

            <!-- Current map (source protocol) -->
            <div v-if="currentMap" class="gameserver-header__status-item">
              <span class="gameserver-header__status-label">Current Map</span>
              <Badge variant="neutral">
                <Icon name="ph:map-pin" />
                {{ currentMap }}
              </Badge>
            </div>
          </Flex>
        </div>
      </Flex>
    </Flex>
  </div>

  <!-- Complaints Manager -->
  <ComplaintsManager
    v-model:open="showComplaintModal"
    :context-gameserver-id="gameserver.id"
    :context-gameserver-name="gameserver.name"
    :start-with-submit="true"
    @submit="handleComplaintSubmit"
  />
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.gameserver-header {
  &__title-container {
    margin-bottom: var(--space-m);
  }

  &__game-icon-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
  }

  &__mobile-report {
    width: 100%;
  }

  &__game-icon-button {
    border: none;
    background: transparent;
    padding: 0;
    display: flex;
    cursor: pointer;

    .game-icon-container,
    .game-icon,
    .game-icon-skeleton {
      width: 72px;
      height: 72px;
    }
  }

  &__game-badge-button {
    border: none;
    background: transparent;
    padding: 0;
    display: inline-flex;
    cursor: pointer;
  }

  &__title {
    font-size: var(--font-size-xxxl);
    font-weight: var(--font-weight-bold);
    margin: 0;
    line-height: 1.2;
  }

  &__description {
    font-size: var(--font-size-l);
    color: var(--color-text-light);
    line-height: 1.5;
  }

  &__title-row {
    @media screen and (max-width: $breakpoint-xs) {
    }
  }

  &__title-section {
    flex: 1;
  }

  &__connect-section {
    flex-shrink: 0;
  }

  &__connect-actions {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-s);
  }

  &__administrator-info {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-xs);
  }

  &__aside {
    align-items: flex-start;
  }

  &__administrator-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  &__info-section {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-m);
  }

  &__badges-section {
    margin-bottom: var(--space-s);
  }

  &__status-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    align-items: flex-start;
  }

  &__status-label {
    font-size: var(--font-size-xxs);
    color: var(--color-text-light);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    // letter-spacing: 0.5px;
  }

  &__status-value {
    font-size: var(--font-size-s);
    color: var(--color-text);
    font-weight: var(--font-weight-medium);
  }

  &__actions {
    flex-shrink: 0;
  }

  &__connect-button {
    display: flex;
    margin-top: 0;

    .vui-button {
      font-size: var(--font-size-m);
      font-weight: var(--font-weight-medium);
    }
  }

  @media (max-width: 768px) {
    &__game-icon-button {
      .game-icon-container,
      .game-icon,
      .game-icon-skeleton {
        width: 48px;
        height: 48px;
      }
    }

    &__title {
      font-size: var(--font-size-xxl);
    }

    &__description {
      font-size: var(--font-size-m);
    }

    &__title-row {
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: var(--space-m) !important;
    }

    &__title-container {
      margin-bottom: 0;
    }

    &__actions {
      align-self: stretch;

      .gameserver-header__connect-button {
        flex: 1;
      }
    }

    &__administrator-info {
      align-items: flex-start;
    }

    &__status-label {
      font-size: var(--font-size-xs);
    }

    &__aside {
      padding-left: 60px;
    }
  }

  @media (max-width: 480px) {
    &__title {
      font-size: var(--font-size-xl);
    }
  }
}
</style>
