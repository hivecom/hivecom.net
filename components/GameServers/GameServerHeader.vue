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
    <NuxtLink to="/gameservers" class="back-link">
      <Button variant="gray" size="s">
        <template #start>
          <Icon name="ph:arrow-left" />
        </template>
        Back to Game Servers
      </Button>
    </NuxtLink>
  </Flex>
  <div class="gameserver-header-section">
    <!-- Title and actions row -->
    <Flex x-between align="start" gap="l" class="title-row">
      <div class="title-section">
        <h1 class="gameserver-title">
          {{ gameserver.name }}
        </h1>
      </div>

      <Flex>
        <!-- Administrator -->
        <div v-if="gameserver.administrator" class="administrator-info">
          <span class="administrator-label">Administrator</span>
          <UserDisplay :user-id="gameserver.administrator" size="s" />
        </div>
      </Flex>
      <!-- Connect Button -->
      <div v-if="gameserver.addresses && gameserver.addresses.length || gameserver.administrator" class="connect-section">
        <div class="connect-actions">
          <div v-if="gameserver.addresses && gameserver.addresses.length" class="connect-button">
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
        <p v-if="gameserver.description" class="gameserver-description">
          {{ gameserver.description }}
        </p>

        <!-- Quick info badges and status -->
        <div class="info-section">
          <Flex gap="m" wrap class="badges-section">
            <Badge v-if="game" variant="accent" size="l">
              <Icon name="ph:game-controller" />
              {{ game.name }}
            </Badge>

            <Badge v-if="gameserver.region" variant="neutral" size="l">
              <RegionIndicator :region="gameserver.region" show-label />
            </Badge>
          </Flex>

          <!-- Status Information -->
          <div v-if="container" class="status-info">
            <Flex gap="m" wrap>
              <div class="status-item">
                <span class="status-label">Running</span>
                <Badge :variant="container.running ? 'success' : 'danger'" size="s">
                  <Icon :name="container.running ? 'ph:check' : 'ph:x'" />
                  {{ container.running ? 'Yes' : 'No' }}
                </Badge>
              </div>

              <div v-if="container.healthy !== null" class="status-item">
                <span class="status-label">Healthy</span>
                <Badge :variant="container.healthy ? 'success' : 'warning'" size="s">
                  <Icon :name="container.healthy ? 'ph:check' : 'ph:warning'" />
                  {{ container.healthy ? 'Yes' : 'No' }}
                </Badge>
              </div>

              <div class="status-item">
                <span class="status-label">Last Reported</span>
                <span class="status-value">
                  <TimestampDate small :date="container.reported_at" />
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
.gameserver-title {
  font-size: var(--font-size-xxxl);
  font-weight: 700;
  margin: 0;
  line-height: 1.2;
}

.gameserver-description {
  font-size: var(--font-size-l);
  color: var(--color-text-muted);
  line-height: 1.5;
}

.title-row {
  margin-bottom: var(--space-s);
}

.title-section {
  flex: 1;
}

.connect-section {
  flex-shrink: 0;
}

.connect-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-s);
}

.administrator-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-xs);

  .administrator-label {
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}

.info-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}

.badges-section {
  margin-bottom: var(--space-s);
}

.status-info {
  padding-top: var(--space-m);
  border-top: 1px solid var(--color-border);

  .status-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    align-items: flex-start;

    .status-label {
      font-size: var(--font-size-xs);
      font-weight: 600;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .status-value {
      font-size: var(--font-size-s);
      color: var(--color-text);
      font-weight: 500;
    }
  }
}

.status-indicator-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-badge {
  margin-top: var(--space-xs);
}

.status-tooltip {
  font-size: var(--font-size-s);
  line-height: 1.4;
}

.back-link {
  text-decoration: none;
}

@media (max-width: 768px) {
  .gameserver-title {
    font-size: var(--font-size-xxl);
  }

  .gameserver-description {
    font-size: var(--font-size-m);
  }

  .title-row {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-m);
  }

  .connect-section {
    align-self: stretch;

    .connect-actions {
      align-items: stretch;

      .administrator-info {
        align-items: flex-start;
      }
    }
  }

  .status-info {
    .status-item {
      .status-label {
        font-size: var(--font-size-xs);
      }
    }
  }
}

@media (max-width: 480px) {
  .status-indicator-wrapper {
    .status-indicator {
      width: 32px;
      height: 32px;
    }
  }

  .gameserver-title {
    font-size: var(--font-size-xl);
  }
}
</style>
