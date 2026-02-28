<script setup lang="ts">
import { Avatar, Badge, Flex } from '@dolanske/vui'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import UserName from '@/components/Shared/UserName.vue'
import UserRole from '@/components/Shared/UserRole.vue'

interface Props {
  userId?: string | null
  showRole?: boolean
  size?: 's' | 'm' | 'l'
  showProfilePreview?: boolean
  /**
   * Hide avatar, but this option is only respected if
   */
  hideAvatar?: boolean
  centered?: boolean
}

withDefaults(defineProps<Props>(), {
  showRole: false,
  size: 'm',
  showProfilePreview: true,
  hideAvatar: false,
})
</script>

<template>
  <div class="user-display">
    <Flex gap="s" y-center x-center class="user-display__header">
      <!-- Avatar -->
      <template v-if="!hideAvatar">
        <!-- System avatar (no userId) -->
        <Avatar v-if="!userId" :size="size" url="/icon.svg" />
        <!-- User avatar -->
        <UserAvatar
          v-else
          :user-id="userId"
          :size="size"
          linked
          :show-preview="showProfilePreview"
        />
      </template>

      <!-- Name & role -->
      <div class="user-display__info">
        <Flex
          gap="xs"
          :x-start="!centered"
          :x-center="!!centered"
          y-center
          wrap
          class="user-display__name-row"
        >
          <UserName :user-id="userId" :size="size">
            <Badge v-if="!userId" size="xs" variant="accent">
              System
            </Badge>
          </UserName>
          <UserRole v-if="showRole && userId" :user-id="userId" size="s" />
        </Flex>
      </div>
    </Flex>
  </div>
</template>

<style lang="scss" scoped>
.user-display {
  &__info {
    display: flex;
    align-items: center;
  }

  &__name-row {
    align-items: center;
  }
}
</style>
