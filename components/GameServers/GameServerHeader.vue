<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Badge, Button, CopyClipboard, Dropdown, DropdownItem, Flex } from '@dolanske/vui'
import RegionIndicator from '~/components/Shared/RegionIndicator.vue'
import TimestampDate from '~/components/Shared/TimestampDate.vue'
import UserDisplay from '~/components/Shared/UserDisplay.vue'

interface Props {
  gameserver: Tables<'gameservers'>
  game?: Tables<'games'> | null
  container?: Tables<'containers'> | null
}

defineProps<Props>()
</script>

<template>
  <!-- Navigation -->
  <Flex x-between>
    <Button
      variant="gray"
      size="s"
      aria-label="Go back to Game Servers"
      class="gameserver-header__back-link"
      @click="$router.push('/gameservers')"
    >
      <template #start>
        <Icon name="ph:arrow-left" />
      </template>
      Back to Game Servers
    </Button>
  </Flex>
  <div class="gameserver-header">
    <!-- Title and actions row -->
    <Flex x-between align="start" gap="l" class="gameserver-header__title-row">
      <div class="gameserver-header__title-section">
        <h1 class="gameserver-header__title">
          {{ gameserver.name }}
        </h1>
      </div>

      <Flex>
        <!-- Administrator -->
        <div v-if="gameserver.administrator" class="gameserver-header__administrator-info">
          <span class="gameserver-header__administrator-label">Administrator</span>
          <UserDisplay :user-id="gameserver.administrator" size="s" />
        </div>
      </Flex>
      <!-- Connect Button -->
      <div v-if="gameserver.addresses && gameserver.addresses.length || gameserver.administrator" class="gameserver-header__connect-section">
        <div class="gameserver-header__connect-actions">
          <div v-if="gameserver.addresses && gameserver.addresses.length" class="gameserver-header__connect-button">
            <CopyClipboard
              v-if="gameserver.addresses.length === 1"
              :text="`${gameserver.addresses[0]}${gameserver.port ? `:${gameserver.port}` : ''}`"
              confirm
            >
              <Button variant="success" size="l">
                <template #start>
                  <Icon name="ph:play" />
                </template>
                Connect
              </Button>
            </CopyClipboard>

            <Dropdown v-else>
              <template #trigger="{ toggle }">
                <Button variant="success" size="l" @click="toggle">
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
        </div>
      </div>
    </Flex>

    <Flex y-start x-between gap="l" expand>
      <Flex column gap="xs" expand>
        <!-- Description -->
        <p v-if="gameserver.description" class="gameserver-header__description">
          {{ gameserver.description }}
        </p>

        <!-- Quick info badges and status -->
        <div class="gameserver-header__info-section">
          <Flex gap="m" wrap class="gameserver-header__badges-section">
            <Badge v-if="game" variant="neutral" size="l">
              <Icon name="ph:game-controller" />
              {{ game.name }}
            </Badge>

            <Badge v-if="gameserver.region" variant="neutral" size="l">
              <RegionIndicator :region="gameserver.region" show-label />
            </Badge>
          </Flex>

          <!-- Status Information -->
          <div v-if="container" class="gameserver-header__status-info">
            <Flex gap="m" wrap>
              <div class="gameserver-header__status-item">
                <span class="gameserver-header__status-label">Running</span>
                <Badge :variant="container.running ? 'success' : 'danger'" size="s">
                  <Icon :name="container.running ? 'ph:check' : 'ph:x'" />
                  {{ container.running ? 'Yes' : 'No' }}
                </Badge>
              </div>

              <div v-if="container.healthy !== null" class="gameserver-header__status-item">
                <span class="gameserver-header__status-label">Healthy</span>
                <Badge :variant="container.healthy ? 'success' : 'warning'" size="s">
                  <Icon :name="container.healthy ? 'ph:check' : 'ph:warning'" />
                  {{ container.healthy ? 'Yes' : 'No' }}
                </Badge>
              </div>

              <div class="gameserver-header__status-item">
                <span class="gameserver-header__status-label">Last Reported</span>
                <span class="gameserver-header__status-value">
                  <TimestampDate size="xs" :date="container.reported_at" />
                </span>
              </div>
            </Flex>
          </div>
        </div>
      </Flex>
    </Flex>
  </div>
</template>

<style lang="scss" scoped>
.gameserver-header {
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
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  &__status-value {
    font-size: var(--font-size-s);
    color: var(--color-text);
    font-weight: var(--font-weight-medium);
  }

  &__back-link {
    text-decoration: none;
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

    &__connect-section {
      align-self: stretch;
    }

    &__connect-actions {
      align-items: stretch;
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
