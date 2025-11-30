<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Button, CopyClipboard, Dropdown, DropdownItem, Flex } from '@dolanske/vui'
import GameIcon from '@/components/GameServers/GameIcon.vue'
import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import GameDetailsModalTrigger from '@/components/Shared/GameDetailsModalTrigger.vue'
import RegionIndicator from '@/components/Shared/RegionIndicator.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserLink from '../Shared/UserLink.vue'

interface Props {
  gameserver: Tables<'gameservers'>
  game?: Tables<'games'> | null
  container?: Tables<'containers'> | null
  // FIxme: these props are passed in, but unused
  state: string
  stateConfig: unknown // TODO: add type
}

const _props = defineProps<Props>()

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
    navigateTo('/auth/sign-in')
    return
  }

  showComplaintModal.value = true
}
</script>

<template>
  <!-- Navigation -->
  <Flex x-between>
    <Button
      variant="gray"
      plain
      size="s"
      aria-label="Go back to Game Servers"
      class="gameserver-header__back-link"
      @click="$router.push('/gameservers')"
    >
      <template #start>
        <Icon name="ph:arrow-left" />
      </template>
      Game Servers
    </Button>
  </Flex>
  <div class="gameserver-header">
    <!-- Title and actions row -->
    <Flex x-between align="start" gap="l" class="gameserver-header__title-row">
      <div class="gameserver-header__title-section">
        <Flex gap="l" y-start class="gameserver-header__title-container">
          <GameDetailsModalTrigger
            v-if="game"
            v-slot="{ open }"
            :game-id="game.id"
          >
            <button
              type="button"
              class="gameserver-header__game-icon-button"
              :aria-label="`Open details for ${game.name ?? 'game'}`"
              @click.stop="open"
            >
              <GameIcon :game="game" size="xl" />
            </button>
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

      <Flex gap="m" class="gameserver-header__aside" y-start>
        <!-- Administrator -->
        <div v-if="gameserver.administrator" class="gameserver-header__administrator-info">
          <span class="gameserver-header__administrator-label">Administrator</span>
          <UserLink :user-id="gameserver.administrator" size="s" />
        </div>

        <!-- Connect Button -->
        <div
          v-if="gameserver.addresses && gameserver.addresses.length"
          class="gameserver-header__connect-button"
        >
          <CopyClipboard
            v-if="gameserver.addresses.length === 1"
            :text="`${gameserver.addresses[0]}${gameserver.port ? `:${gameserver.port}` : ''}`"
            confirm
          >
            <Button variant="accent" size="m">
              <template #start>
                <Icon name="ph:play" />
              </template>
              Connect
            </Button>
          </CopyClipboard>

          <Dropdown v-else>
            <template #trigger="{ toggle }">
              <Button variant="accent" size="m" @click="toggle">
                <Flex y-center gap="xs">
                  Connect
                  <Icon name="ph:caret-down" size="s" />
                </Flex>
              </Button>
            </template>
            <DropdownItem v-for="address in gameserver.addresses" :key="address">
              <CopyClipboard :text="`${address}${gameserver.port ? `:${gameserver.port}` : ''}`" confirm>
                <Flex y-center gap="xs">
                  <Icon name="ph:copy" size="s" />
                  {{ `${address}${gameserver.port ? `:${gameserver.port}` : ''}` }}
                </Flex>
              </CopyClipboard>
            </DropdownItem>
          </Dropdown>
        </div>
      </Flex>
    </Flex>

    <Flex y-start x-between gap="l" expand>
      <Flex column gap="xs" expand>
        <!-- Quick info badges and status -->
        <div class="gameserver-header__info-section">
          <!-- Status Information -->
          <div class="gameserver-header__status-info">
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
                <Badge v-if="gameserver.region" variant="neutral" size="l">
                  <RegionIndicator :region="gameserver.region" show-label />
                </Badge>
              </div>

              <div v-if="container" class="gameserver-header__status-item">
                <span class="gameserver-header__status-label">Running</span>
                <Badge :variant="container.running ? 'success' : 'neutral'" size="s">
                  <Icon :name="container.running ? 'ph:check' : 'ph:x'" />
                  {{ container.running ? 'Yes' : 'No' }}
                </Badge>
              </div>

              <div
                v-if="container && container.healthy !== null && container.running"
                class="gameserver-header__status-item"
              >
                <span class="gameserver-header__status-label">Healthy</span>
                <Badge :variant="container.healthy ? 'success' : 'warning'" size="s">
                  <Icon :name="container.healthy ? 'ph:check' : 'ph:warning'" />
                  {{ container.healthy ? 'Yes' : 'No' }}
                </Badge>
              </div>

              <div v-if="container" class="gameserver-header__status-item">
                <span class="gameserver-header__status-label">Last Reported</span>
                <Badge v-if="container.reported_at">
                  <TimestampDate size="xs" :date="container.reported_at" />
                </Badge>
              </div>

              <div class="flex-1" />
              <Button variant="danger" size="s" @click="openComplaintModal">
                <template #start>
                  <Icon name="ph:chat-circle-text" />
                </template>
                Report Issue
              </Button>
            </Flex>
          </div>
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
.gameserver-header {
  &__title-container {
    margin-bottom: var(--space-l);
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
    margin-bottom: var(--space-s);
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

  &__status-info {
    padding-top: var(--space-m);
    border-top: 1px solid var(--color-border);
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

  &__back-link {
    text-decoration: none;
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
    &__title {
      font-size: var(--font-size-xxl);
    }

    &__description {
      font-size: var(--font-size-m);
    }

    &__title-row {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-m);
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
  }

  @media (max-width: 480px) {
    &__title {
      font-size: var(--font-size-xl);
    }
  }
}
</style>
