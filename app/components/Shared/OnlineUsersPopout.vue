<script setup lang="ts">
import type { Placement } from '@floating-ui/vue'
import { Flex, PopoutHover, Skeleton } from '@dolanske/vui'
import { computed } from 'vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'

const props = defineProps<{
  // Known user IDs to display (loaded after hover fetch)
  userIds?: string[]
  // Total count for the country (used for "+N more" and skeletons)
  count?: number
  // Whether the fetch is in progress (shows skeleton rows)
  loading?: boolean
  placement?: Placement
  disabled?: boolean
  maxUsers?: number
}>()

const max = computed(() => props.maxUsers ?? 10)
const visibleIds = computed(() => (props.userIds ?? []).slice(0, max.value))
const extraCount = computed(() => (props.count ?? props.userIds?.length ?? 0) - max.value)
const skeletonCount = computed(() => Math.min(props.count ?? 0, max.value))
const isDisabled = computed(() => props.disabled || (props.count ?? 0) === 0)
</script>

<template>
  <PopoutHover :disabled="isDisabled" :placement="placement ?? 'bottom-end'">
    <template #trigger>
      <slot />
    </template>
    <Flex column gap="xs" class="px-m py-s">
      <!-- Loading skeleton -->
      <template v-if="loading">
        <Flex
          v-for="i in skeletonCount"
          :key="i"
          gap="s"
          y-center
        >
          <Skeleton circle width="28px" height="28px" />
          <Skeleton width="90px" height="10px" />
        </Flex>
      </template>
      <!-- Loaded users -->
      <template v-else>
        <UserDisplay
          v-for="id in visibleIds"
          :key="id"
          :user-id="id"
          size="s"
          show-profile-preview
        />
        <span v-if="extraCount > 0" class="online-users-popout__more">
          +{{ extraCount }} more
        </span>
      </template>
    </Flex>
  </PopoutHover>
</template>

<style lang="scss">
.online-users-popout__more {
  font-size: var(--font-size-xs);
  color: var(--color-text-lighter);
  padding-top: var(--space-xxs);
}
</style>
