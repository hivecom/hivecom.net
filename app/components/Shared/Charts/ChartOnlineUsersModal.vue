<script setup lang="ts">
import { Flex, Skeleton } from '@dolanske/vui'
import ChartActivityHistogramModal from '@/components/Shared/Charts/ChartActivityHistogramModal.vue'
import ChartOnlineUsers from '@/components/Shared/Charts/ChartOnlineUsers.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'

defineProps<{
  onlineUserIds: string[]
  onlineUsersLoading: boolean
  onlineCount: number | null
}>()

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <ChartActivityHistogramModal
    v-model:open="open"
    title="Users Online"
    :count="onlineCount"
    count-label="online"
    count-singular="online"
    :initial-period="onlineCount ? '24h' : '14d'"
    :series="['usersOnline']"
  >
    <template #above-chart>
      <Flex v-if="onlineUserIds.length > 0 || onlineUsersLoading" column gap="xs" expand>
        <Flex expand wrap gap="xs" class="online-users-modal__grid" y-center x-center>
          <template v-if="onlineUsersLoading">
            <Skeleton
              v-for="n in Math.min(onlineCount ?? 8, 20)"
              :key="n"
              width="40px"
              height="40px"
              style="border-radius: var(--border-radius-pill);"
            />
          </template>
          <template v-else>
            <UserAvatar
              v-for="id in onlineUserIds"
              :key="id"
              :user-id="id"
              size="m"
              linked
              show-preview
              show-online-indicator
            />
          </template>
        </Flex>
      </Flex>
    </template>
    <template #default="{ period, window, utc, color }">
      <ChartOnlineUsers :period :window :utc :color fresh hide-title />
    </template>
  </ChartActivityHistogramModal>
</template>

<style lang="scss" scoped>
.online-users-modal__grid {
  max-height: 148px;
  overflow-y: auto;
  padding: var(--space-xs);
  background: var(--color-bg-card);
  border-radius: var(--border-radius-m);
}
</style>
