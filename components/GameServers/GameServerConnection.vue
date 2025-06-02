<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Button, Card, CopyClipboard, Dropdown, DropdownItem, Flex } from '@dolanske/vui'

interface Props {
  gameserver: Tables<'gameservers'>
}

defineProps<Props>()
</script>

<template>
  <Card v-if="gameserver.addresses && gameserver.addresses.length" class="connection-details">
    <Flex column gap="l">
      <h3 class="section-title">
        <Icon name="ph:globe" />
        Connection Details
      </h3>

      <div class="connection-section">
        <h4 class="connection-subtitle">
          Server Addresses
        </h4>
        <div class="addresses-grid">
          <Card
            v-for="address in gameserver.addresses"
            :key="address"
            class="address-card"
          >
            <Flex x-between x-center gap="m">
              <div class="address-info">
                <div class="address-text">
                  {{ `${address}${gameserver.port ? `:${gameserver.port}` : ''}` }}
                </div>
                <div class="address-label">
                  Server Address
                </div>
              </div>
              <CopyClipboard
                :text="`${address}${gameserver.port ? `:${gameserver.port}` : ''}`"
                confirm
              >
                <Button variant="accent" size="s">
                  <template #start>
                    <Icon name="ph:copy" />
                  </template>
                  Copy
                </Button>
              </CopyClipboard>
            </Flex>
          </Card>
        </div>

        <!-- Quick Join Button -->
        <div class="quick-join-section">
          <h4 class="connection-subtitle">
            Quick Join
          </h4>
          <div class="quick-join-buttons">
            <CopyClipboard
              v-if="gameserver.addresses.length === 1"
              :text="`${gameserver.addresses[0]}${gameserver.port ? `:${gameserver.port}` : ''}`"
              confirm
            >
              <Button variant="success" size="l">
                <template #start>
                  <Icon name="ph:play" />
                </template>
                Join Server
              </Button>
            </CopyClipboard>

            <Dropdown v-else>
              <template #trigger="{ toggle }">
                <Button variant="success" size="l" @click="toggle">
                  <template #start>
                    <Icon name="ph:play" />
                  </template>
                  <Flex x-center gap="xs">
                    Join Server
                    <Icon name="ph:caret-down" size="s" />
                  </Flex>
                </Button>
              </template>
              <DropdownItem v-for="address in gameserver.addresses" :key="address">
                <CopyClipboard :text="`${address}${gameserver.port ? `:${gameserver.port}` : ''}`" confirm>
                  <Flex x-center gap="xs">
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
  </Card>
</template>

<style lang="scss" scoped>
.section-title {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  font-size: var(--font-size-xl);
  font-weight: 600;
  margin: 0;
  color: var(--color-text);

  svg {
    color: var(--color-accent);
  }
}

.connection-subtitle {
  font-size: var(--font-size-l);
  font-weight: 600;
  margin: 0 0 var(--space-m) 0;
  color: var(--color-text);
}

.addresses-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
  margin-bottom: var(--space-l);
}

.address-card {
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);

  .address-info {
    flex: 1;

    .address-text {
      font-size: var(--font-size-m);
      font-weight: 600;
      color: var(--color-text);
      margin-bottom: var(--space-xs);
    }

    .address-label {
      font-size: var(--font-size-s);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
  }
}

.quick-join-section {
  padding-top: var(--space-l);
  border-top: 1px solid var(--color-border);

  .quick-join-buttons {
    display: flex;
    gap: var(--space-m);
  }
}

@media (max-width: 768px) {
  .quick-join-buttons {
    flex-direction: column;
  }
}

@media (max-width: 480px) {
  .addresses-grid {
    .address-card {
      .address-info {
        .address-text {
          font-size: var(--font-size-s);
        }
      }
    }
  }
}
</style>
