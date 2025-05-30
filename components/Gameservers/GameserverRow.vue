<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Button, CopyClipboard, Dropdown, DropdownItem, Flex, Skeleton, Tooltip } from '@dolanske/vui'
import { capitalize } from 'vue'
import Metadata from '~/components/Shared/Metadata.vue'
import RegionIndicator from '~/components/Shared/RegionIndicator.vue'
import UserLink from '~/components/Shared/UserLink.vue'

const props = defineProps<{
  game?: Tables<'games'> | null
  gameserver: Tables<'gameservers'>
  container: Tables<'containers'> | null
}>()

const expanded = ref(false)

const state = computed(() => {
  if (!props.container)
    return 'unknown'

  if (props.container.running && props.container.healthy) {
    return 'healthy'
  }
  else if (props.container.running && !props.container.healthy) {
    return 'unhealthy'
  }
  else {
    return 'offline'
  }
})
</script>

<template>
  <div class="gameserver-row">
    <Flex y-center row x-between gap="s" :class="`gameserver-row-header ${expanded ? 'expanded' : ''}`">
      <Flex y-center row gap="s">
        <Button :icon="expanded ? `ph:caret-down` : `ph:caret-right`" square variant="gray" size="s" @click="expanded = !expanded" />
        <Tooltip placement="top">
          <template #tooltip>
            <p>{{ capitalize(state) }}</p>
          </template>
          <div :class="`gameserver-indicator ${state}`" />
        </Tooltip>
        <span class="flex-1 text-ms">{{ props.gameserver.name }}</span>
      </Flex>
      <Flex y-center row gap="s">
        <div v-if="props.gameserver.description" class="gameserver-description-main">
          <span class="description-text">{{ props.gameserver.description }}</span>
        </div>
        <div class="region-badge">
          <RegionIndicator :region="props.gameserver.region" show-label />
        </div>
        <template v-if="props.gameserver.addresses">
          <CopyClipboard v-if="props.gameserver.addresses.length === 1" :text="`${props.gameserver.addresses[0]}${props.gameserver.port ? `:${props.gameserver.port}` : ''}`" confirm>
            <Button size="s" variant="gray">
              Join
            </Button>
          </CopyClipboard>
          <Dropdown v-else>
            <template #trigger="{ toggle }">
              <Button size="s" variant="gray" @click="toggle">
                <Flex y-center gap="xs">
                  Join
                  <Icon name="ph:caret-down" size="s" />
                </Flex>
              </Button>
            </template>
            <DropdownItem v-for="address in props.gameserver.addresses" :key="address">
              <CopyClipboard :text="`${address}${props.gameserver.port ? `:${props.gameserver.port}` : ''}`" confirm>
                {{ `${address}${props.gameserver.port ? `:${props.gameserver.port}` : ''}` }}
              </CopyClipboard>
            </DropdownItem>
          </Dropdown>
        </template>
      </Flex>
    </Flex>
    <Flex v-if="expanded" column gap="s" class="gameserver-row-child">
      <!-- Details Grid -->
      <Flex gap="l" wrap class="gameserver-details">
        <!-- Administrator -->
        <div v-if="props.gameserver.administrator" class="detail-item">
          <span class="detail-label">Administrator</span>
          <UserLink :user-id="props.gameserver.administrator" />
        </div>
      </Flex>

      <!-- Markdown Content -->
      <Suspense v-if="props.gameserver.markdown" class="gameserver-markdown" suspensible>
        <template #fallback>
          <Skeleton class="gameserver-markdown-skeleton" height="320px" />
        </template>
        <MDC :partial="true" class="gameserver-markdown-content typeset" :value="props.gameserver.markdown" />
      </Suspense>
      <div v-else-if="!props.gameserver.markdown" class="gameserver-markdown-placeholder">
        <p class="text-muted">
          No additional details available.
        </p>
      </div>

      <!-- Metadata Section -->
      <Metadata
        :created-at="props.gameserver.created_at"
        :created-by="props.gameserver.created_by"
        :modified-at="props.gameserver.modified_at"
        :modified-by="props.gameserver.modified_by"
      />
    </Flex>
  </div>
</template>

<style lang="scss">
@use '@/assets/breakpoints.scss' as *;

.gameserver-row {
  width: 100% !important;
}

.gameserver-row-header {
  padding: var(--space-xs) var(--space-m);
  border-radius: var(--border-radius-m);
  background-color: var(--color-bg-raised);
  transition: background-color 0.2s ease-in-out;

  &.expanded {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
}

.gameserver-row-child {
  padding: 0 var(--space-m) var(--space-m) var(--space-m);
  border-radius: var(--border-radius-m);
  border-top-left-radius: 0;
  border-top-right-radius: 0;
  border: 1px solid var(--color-bg-raised);
  transition: background-color 0.2s ease-in-out;
}

.gameserver-description {
  margin-bottom: var(--space-xs);
  color: var(--color-text-muted);
  line-height: 1.5;
}

.gameserver-description-main {
  display: flex;
  align-items: center;
  margin: 0 var(--space-s);

  .description-text {
    font-size: var(--font-size-s);
    color: var(--color-text-muted);
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 400px;
  }

  @media screen and (max-width: $breakpoint-md) {
    display: none;
  }
}

.gameserver-markdown {
  width: 100%;
}

.gameserver-markdown-skeleton {
  width: 100%;
}

.gameserver-markdown-placeholder {
  margin-bottom: var(--space-s);

  .text-muted {
    color: var(--color-text-muted);
    font-style: italic;
    font-size: var(--font-size-s);
  }
}

.gameserver-details {
  margin-top: var(--space-xs);
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-width: 120px;
}

.detail-label {
  font-size: var(--font-size-s);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  font-size: var(--font-size-m);
  color: var(--color-text);
  font-weight: 500;
}

.addresses-section {
  margin-top: var(--space-s);
  padding-top: var(--space-s);
  border-top: 1px solid var(--color-border);
}

.addresses-list {
  margin-top: var(--space-xs);
}

.address-item {
  cursor: pointer;

  &:hover .address-text {
    color: var(--color-text-accent);
  }
}

.address-text {
  font-family: var(--font-mono, 'Monaco', 'Menlo', 'Ubuntu Mono', monospace);
  font-size: var(--font-size-s);
  color: var(--color-text-muted);
  background-color: var(--color-bg-raised);
  padding: var(--space-xs) var(--space-s);
  border-radius: var(--border-radius-s);
  transition: color 0.2s ease-in-out;
}

.gameserver-indicator {
  width: 10px;
  height: 10px;
  border-radius: 99px;

  &.healthy {
    background-color: var(--color-text-green);
  }

  &.unhealthy {
    background-color: var(--color-text-red);
  }

  &.unknown {
    background-color: var(--color-text-yellow);
  }

  &.offline {
    background-color: var(--color-text-gray);
  }
}

.admin-info {
  margin-right: var(--space-s);
}

.admin-badge {
  background-color: var(--color-bg);
  padding: var(--space-xs) var(--space-s);
  border-radius: var(--border-radius-s);
  border: 1px solid var(--color-border);
}

.admin-username {
  font-size: var(--font-size-s);
  font-weight: 500;
  color: var(--color-text-accent);
}

.region-badge {
  background-color: var(--color-bg);
  padding: var(--space-xs) var(--space-s);
  border-radius: var(--border-radius-s);
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
}

.region-badge .region-indicator {
  font-size: var(--font-size-s);
  font-weight: 600;
  color: var(--color-text-muted);
}
</style>
