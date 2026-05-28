<script setup lang="ts">
import { Badge, Card, Flex } from '@dolanske/vui'

const props = defineProps<{
  name: string
  path: string
  icon: string
  description: string
  stat?: number
  statVariant?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent'
}>()
</script>

<template>
  <NuxtLink :to="props.path" class="dashboard-nav-tile">
    <Card class="dashboard-nav-tile__card" :padding="false">
      <Flex y-center gap="s" class="dashboard-nav-tile__inner">
        <div class="dashboard-nav-tile__icon-wrap">
          <Icon :name="props.icon" size="20" />
        </div>
        <Flex column :gap="0" class="dashboard-nav-tile__text">
          <Flex y-center gap="xs">
            <span class="dashboard-nav-tile__name">{{ props.name }}</span>
            <Badge
              v-if="props.stat !== undefined"
              :variant="props.statVariant ?? 'neutral'"
              size="s"
              circle
              filled
              class="dashboard-nav-tile__badge"
            >
              {{ props.stat }}
            </Badge>
          </Flex>
          <span class="dashboard-nav-tile__desc">{{ props.description }}</span>
        </Flex>
      </Flex>
    </Card>
  </NuxtLink>
</template>

<style scoped lang="scss">
.dashboard-nav-tile {
  text-decoration: none;
  display: block;

  &__card {
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-m);
    transition:
      border-color var(--transition),
      background var(--transition);

    &:hover {
      border-color: var(--color-border-strong);
      background: var(--color-bg-raised);
    }
  }

  &__inner {
    padding: var(--space-m);
  }

  &__icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--border-radius-s);
    background: var(--color-bg-medium);
    color: var(--color-text-light);
    flex-shrink: 0;
  }

  &__text {
    min-width: 0;
  }

  &__name {
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__desc {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__badge {
    flex-shrink: 0;
  }
}
</style>
