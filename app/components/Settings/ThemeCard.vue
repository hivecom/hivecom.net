<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Button, Card, Flex, theme } from '@dolanske/vui'
import { themeToScopedProperties } from '@/lib/theme'
import { truncate } from '@/lib/utils/formatting'
import TinyBadge from '../Shared/TinyBadge.vue'
import UserDisplay from '../Shared/UserDisplay.vue'

const props = defineProps<{
  item: Tables<'themes'>
  activeThemeId: string | undefined
}>()

const emit = defineEmits<{
  apply: [id: string]
}>()
</script>

<template>
  <div class="theme-menu__card" :class="{ active: props.item.id === props.activeThemeId }">
    <!-- Theme preview UI -->
    <TinyBadge v-if="props.item.id === props.activeThemeId" variant="accent" filled>
      Active
    </TinyBadge>

    <div class="theme-menu__card--preview" :style="themeToScopedProperties(props.item, theme === 'light' ? 'light' : 'dark')">
      <Card>
        <template #header>
          <Flex column gap="xxs">
            <strong class="text-color">{{ props.item.name }}</strong>
            <p class="text-color-lighter">
              {{ props.item.description ? truncate(props.item.description, 40) : 'Lorem dolan sit amon please just sit down...' }}
            </p>
          </Flex>
        </template>
        <template #header-end>
          <Flex gap="xs">
            <TinyBadge variant="info">
              Cool
            </TinyBadge>
            <TinyBadge variant="warning">
              Theme
            </TinyBadge>
          </Flex>
        </template>
        <Alert variant="success" filled>
          You have successfully looked
        </Alert>

        <div style="height:156px" />
      </Card>
    </div>

    <!-- Theme metadata -->
    <div class="theme-menu__card--content">
      <strong>{{ props.item.name }}</strong>
      <p v-if="props.item.description">
        {{ props.item.description }}
      </p>
      <div class="flex-1" />
      <Flex start class="mt-m" gap="xs">
        <UserDisplay :user-id="props.item.created_by" size="s" :show-role="false" />
        <div class="flex-1" />
        <Button size="s" outline @click="emit('apply', props.item.id)">
          <template #start>
            <Icon name="ph:paint-brush-fill" :size="16" />
          </template>
          Apply
        </Button>
        <Button size="s" square>
          <Icon name="ph:dots-three-bold" :size="18" />
        </Button>
      </Flex>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.theme-menu__card {
  display: flex;
  flex-direction: column;
  width: 100%;
  position: relative;
  border-radius: var(--border-radius-m);
  border: 1px solid var(--color-border);
  background-color: var(--color-bg-card);
  overflow: hidden;
  flex-grow: 1;
  height: 100%;

  & > .tiny-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 10;
  }

  &.active {
    border-color: var(--color-bg-accent-lowered);
  }

  &:hover {
    .theme-menu__card--preview {
      :deep(.vui-card) {
        top: 32px;
      }
    }

    .theme-menu__card--content {
      :deep(.vui-button) {
        visibility: visible;
      }
    }
  }

  &--preview {
    display: block;
    height: 120px;
    overflow: hidden;
    position: relative;
    border-bottom: 1px solid var(--color-border);
    background-color: var(--color-bg-lowered);
    z-index: 1;
    opacity: 0.75;
    pointer-events: none;
    user-select: none;

    &:before {
      content: '';
      position: absolute;
      inset: 0;
      top: unset;
      height: 16px;
      z-index: 2;
      background: linear-gradient(to top, rgba(8, 8, 8, 0.4), transparent);
    }

    :deep(.vui-card) {
      width: 80%;
      position: absolute;
      left: 50%;
      top: 32px;
      transition: var(--transition-slow);
      transform: translateX(-50%);
    }

    strong {
      font-size: var(--font-size-s);
    }

    p {
      font-size: var(--font-size-xxs);
    }
  }

  &--content {
    display: flex;
    flex-direction: column;
    padding: var(--space-m);
    padding-top: var(--space-l);
    flex: 1;

    :deep(.vui-button) {
      visibility: hidden;
    }

    strong {
      display: block;
      font-size: var(--font-size-l);
    }

    p {
      font-size: var(--font-size-s);
      color: var(--color-text-lighter);
      margin-top: var(--space-s);
    }
  }
}

:root.light .theme-menu__card--preview::before {
  background: linear-gradient(to top, rgba(8, 8, 8, 0.1), transparent);
}
</style>
