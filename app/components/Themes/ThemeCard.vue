<script setup lang="ts">
import type { Database } from '@/types/database.types'
import { Alert, Button, ButtonGroup, Card, Dropdown, DropdownItem, Flex, Skeleton, theme, Tooltip } from '@dolanske/vui'
import { useUserId } from '@/composables/useUserId'
import { themeToScopedProperties } from '@/lib/theme'
import ConfirmModal from '../Shared/ConfirmModal.vue'
import TinyBadge from '../Shared/TinyBadge.vue'
import UserAvatar from '../Shared/UserAvatar.vue'
import UserName from '../Shared/UserName.vue'
import ThemeIcon from './ThemeIcon.vue'

type CardTheme = Database['public']['Tables']['themes']['Row'] & { user_count?: number | null, fork_count?: number | null }

const props = defineProps<{
  item: CardTheme
  activeThemeId: string | undefined
}>()

const emit = defineEmits<{
  apply: []
  remove: []
  deprecate: []
  delete: []
  edit: []
}>()

const isActive = computed(() => props.item.id === props.activeThemeId)

const userId = useUserId()
const { user: userData } = useDataUser(userId, { includeRole: true })

const isAdmin = computed(() => userData.value?.role === 'admin')
const isOwner = computed(() => userId.value != null && props.item.created_by === userId.value)
const canSeeDropdown = computed(() => isOwner.value || isAdmin.value)

const confirmDeprecate = ref(false)
const confirmDelete = ref(false)

// Fetch the forked theme name & author
const fork = ref<{ name: string, created_by: string } | null>(null)
if (props.item.forked_from) {
  useSupabaseClient()
    .from('themes')
    .select('name, created_by')
    .eq('id', props.item.forked_from)
    .single()
    .then(({ data }) => {
      if (data) {
        fork.value = data
      }
    })
}
</script>

<template>
  <NuxtLink
    :to="`/themes/${props.item.id}`"
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

    <ButtonGroup :gap="2" class="theme-menu__card--context">
      <Button size="s" variant="gray" @click.prevent.stop="isActive ? emit('remove') : emit('apply')">
        <template #start>
          <Icon :name="isActive ? 'ph:paint-brush' : 'ph:paint-brush-fill'" :size="16" />
        </template>
        {{ isActive ? 'Remove' : 'Apply' }}
      </Button>
      <Dropdown v-if="canSeeDropdown && !props.item.is_official">
        <template #trigger="{ toggle, isOpen }">
          <Button size="s" square :class="{ active: isOpen }" @click.prevent.stop="toggle">
            <Icon name="ph:dots-three-bold" :size="18" />
          </Button>
        </template>
        <DropdownItem v-if="isOwner || isAdmin" @click="emit('edit')">
          Edit
        </DropdownItem>
        <DropdownItem v-if="!props.item.is_unmaintained && !props.item.is_official" @click="confirmDeprecate = true">
          Deprecate
        </DropdownItem>
        <DropdownItem v-if="isAdmin && props.item.is_unmaintained" class="text-danger" @click="confirmDelete = true">
          Delete
        </DropdownItem>
      </Dropdown>
    </ButtonGroup>

    <div class="theme-menu__card--preview" :style="themeToScopedProperties(props.item, theme === 'light' ? 'light' : 'dark')">
      <Card>
        <template #header>
          <Flex column gap="xxs">
            <Flex gap="xs" y-center>
              <Skeleton class="text-skeleton accent" height="13px" width="48px" style="background-color: var(--color-accent)" />
              <Skeleton class="text-skeleton" height="13px" width="80px" style="background-color: var(--color-text)" />
            </Flex>
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
        <Alert variant="info" filled>
          <Skeleton class="text-skeleton" height="16px" width="154px" style="background-color: var(--color-text-lighter)" />
        </Alert>

        <div style="height:167px" />
      </Card>
    </div>

    <!-- Theme metadata -->
    <div class="theme-menu__card--content">
      <Flex x-start y-start gap="m">
        <ThemeIcon size="l" :theme="props.item" />
        <div class="flex-1">
          <strong>{{ props.item.name }}</strong>
          <p v-if="props.item.description">
            <span class="text-xs">

              {{ props.item.description }}
            </span>
          </p>
        </div>
        <Flex y-center gap="xs">
          <Flex y-center gap="xs" class="theme-stats">
            <template v-if="props.item.user_count != null && props.item.user_count > 0">
              <Icon name="ph:users" :size="12" />
              <span>{{ props.item.user_count }}</span>
            </template>
            <template v-if="props.item.fork_count != null && props.item.fork_count > 0">
              <Icon name="ph:git-fork" :size="12" />
              <span>{{ props.item.fork_count }}</span>
            </template>
          </Flex>
          <Tooltip v-if="props.item.forked_from">
            <UserAvatar :user-id="props.item.created_by ?? undefined" size="s" :show-preview="true" />
            <template #tooltip>
              <p v-if="fork" style="max-width:256px">
                This theme is based on {{ fork.name }} created by
                <b><UserName inherit :user-id="fork.created_by" /></b>
              </p>
            </template>
          </Tooltip>
          <UserAvatar v-else :user-id="props.item.created_by ?? undefined" size="s" :show-preview="true" />
        </Flex>
      </Flex>
    </div>
  </NuxtLink>

  <ConfirmModal
    :open="confirmDeprecate"
    title="Deprecate theme?"
    confirm-text="Deprecate"
    destructive
    @confirm="emit('deprecate'); confirmDeprecate = false"
    @cancel="confirmDeprecate = false"
  >
    <p class="mb-xs">
      Users who are currently using the theme will still be able to keep it, but it won't be visible in the gallery.
    </p>
    <p>This action cannot be undone.</p>
  </ConfirmModal>

  <ConfirmModal
    :open="confirmDelete"
    title="Delete theme?"
    confirm-text="Delete"
    destructive
    @confirm="emit('delete'); confirmDelete = false"
    @cancel="confirmDelete = false"
  >
    <p class="mb-xs">
      This will permanently delete <strong>{{ props.item.name }}</strong> and remove it for all users currently using it.
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
    // border-color: var(--color-text-lightest);
  }

  &:has(.vui-button.active),
  &:hover {
    .theme-menu__card--preview {
      :deep(.vui-card) {
        top: 24px;
      }
    }

    .theme-menu__card--context {
      visibility: visible;
      top: 8px;
      opacity: 1;
    }
  }

  &--context {
    position: absolute;
    top: 16px;
    right: 8px;
    z-index: 10;
    visibility: hidden;
    transition: var(--transition-fast);
    opacity: 0;
  }

  &--preview {
    display: block;
    height: 120px;
    overflow: hidden;
    position: relative;
    background-color: var(--color-bg-lowered);
    z-index: 1;
    opacity: 0.55;
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
        opacity: 0.35;

        &.accent {
          opacity: 0.75;
        }
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
    border-top: 1px solid var(--color-border);

    :deep(.vui-button) {
      visibility: hidden;
    }

    strong {
      display: block;
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-extrabold);
    }

    p {
      font-size: var(--font-size-m);
      color: var(--color-text-lighter);
      margin-top: var(--space-xxs);
    }
  }
}

.theme-stats {
  font-size: var(--font-size-xs);
  color: var(--color-text-lighter);
}

.text-danger {
  color: var(--color-text-red);
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
