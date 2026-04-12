<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Button, ButtonGroup, Card, Dropdown, DropdownItem, Flex, Skeleton, theme } from '@dolanske/vui'
import { useUserId } from '@/composables/useUserId'
import { themeToScopedProperties } from '@/lib/theme'
import ConfirmModal from '../Shared/ConfirmModal.vue'
import TinyBadge from '../Shared/TinyBadge.vue'
import UserDisplay from '../Shared/UserDisplay.vue'

const props = defineProps<{
  item: Tables<'themes'>
  activeThemeId: string | undefined
}>()

const emit = defineEmits<{
  apply: []
  deprecate: []
  edit: []
}>()

const userId = useUserId()
const user = useSupabaseUser()

const confirmDeprecate = ref(false)
</script>

<template>
  <div
    class="theme-menu__card" :class="{ active: props.item.id === props.activeThemeId,
                                       unmaintained: props.item.is_unmaintained }"
  >
    <!-- Theme preview UI -->
    <TinyBadge v-if="props.item.id === props.activeThemeId" variant="accent" filled>
      Active
    </TinyBadge>

    <TinyBadge v-else-if="props.item.is_unmaintained" variant="neutral">
      Deprecated
    </TinyBadge>

    <div class="theme-menu__card--preview" :style="themeToScopedProperties(props.item, theme === 'light' ? 'light' : 'dark')">
      <Card>
        <template #header>
          <Flex column gap="xxs">
            <strong>
              <Skeleton class="text-skeleton" height="13px" width="80px" style="background-color: var(--color-text)" />
            </strong>
            <p>
              <Skeleton class="text-skeleton" height="16px" width="120px" style="background-color: var(--color-text-lighter)" />
            </p>
          </Flex>
        </template>
        <template #header-end>
          <Flex gap="xs">
            <TinyBadge variant="info">
              <Skeleton class="badge-skeleton" height="12px" width="24px" style="background-color: var(--color-text-blue)" />
            </TinyBadge>
            <TinyBadge variant="warning">
              <Skeleton class="badge-skeleton" height="12px" width="36px" style="background-color: var(--color-text-yellow)" />
            </TinyBadge>
          </Flex>
        </template>
        <Alert variant="success" filled>
          <Skeleton class="text-skeleton" height="16px" width="154px" style="background-color: var(--color-text-lighter)" />
        </Alert>

        <div style="height:167px" />
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
        <ButtonGroup :gap="2">
          <Button size="s" @click="emit('apply')">
            <template #start>
              <Icon name="ph:paint-brush-fill" :size="16" />
            </template>
            Apply
          </Button>
          <Dropdown v-if="userId && props.item.created_by === userId">
            <template #trigger="{ toggle, isOpen }">
              <Button size="s" square :class="{ active: isOpen }" @click="toggle">
                <Icon name="ph:dots-three-bold" :size="18" />
              </Button>
            </template>
            <DropdownItem @click="emit('edit')">
              Edit
            </DropdownItem>
            <DropdownItem v-if="userId === props.item.created_by || user?.role === 'moderator' || user?.role === 'admin'" @click="confirmDeprecate = true">
              Deprecate
            </DropdownItem>
          </Dropdown>
        </ButtonGroup>
      </Flex>
    </div>
  </div>

  <ConfirmModal
    :open="confirmDeprecate"
    title="Deprecate theme?"
    confirm-text="Deprecate"
    destructive
    @confirm="emit('deprecate')"
    @cancel="confirmDeprecate = false"
  >
    <p class="mb-xs">
      Users who are currently using the theme will still be able to keep it, but it won't be visible.
    </p>
    <p>This action cannot be undone.</p>
  </ConfirmModal>
</template>

<style lang="scss" scoped>
@use '@/assets/mixins.scss' as *;
@use '@/assets/breakpoints.scss' as *;

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

  &.unmaintained {
    .theme-menu__card--preview {
      filter: saturate(0) opacity(0.25);
    }

    .theme-menu__card--content {
      strong,
      p {
        color: var(--color-text-lighter);
      }
    }
  }

  &.active {
    border-color: var(--color-bg-accent-lowered);
  }

  &:has(.vui-button.active),
  &:hover {
    .theme-menu__card--preview {
      :deep(.vui-card) {
        top: 24px;
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

    :deep(.vui-skeleton) {
      animation: none;

      &.text-skeleton {
        opacity: 0.25;
      }

      &.badge-skeleton {
        opacity: 0.5;
      }
    }

    :deep(.vui-card) {
      width: 80%;
      position: absolute;
      left: 50%;
      top: 32px;
      transition: var(--transition);
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
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-extrabold);
    }

    p {
      font-size: var(--font-size-s);
      color: var(--color-text-lighter);
      margin-top: var(--space-s);
      height: 36px;
      @include line-clamp(2);
    }
  }
}

:root.light .theme-menu__card--preview::before {
  background: linear-gradient(to top, rgba(8, 8, 8, 0.1), transparent);
}

@media screen and (max-width: $breakpoint-s) {
  .theme-menu__card--content {
    :deep(.vui-button) {
      visibility: visible !important;
    }
  }
}
</style>
