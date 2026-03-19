<script setup lang="ts">
import { Button, Tooltip } from '@dolanske/vui'
import { toRefs } from 'vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import UserName from '@/components/Shared/UserName.vue'
import UserPreviewHover from '@/components/Shared/UserPreviewHover.vue'
import NotificationCard from './NotificationCard.vue'

interface Props {
  requestId: string
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
})

const emit = defineEmits<{ (e: 'accept'): void, (e: 'ignore'): void }>()

const { requestId, loading } = toRefs(props)

function handleAccept() {
  emit('accept')
}

function handleIgnore() {
  emit('ignore')
}
</script>

<template>
  <UserPreviewHover :user-id="requestId" class="notification-card-invite__hover-wrapper">
    <NotificationCard icon="ph:user-plus" text="Friend Request">
      <template #below>
        <div class="notification-card-invite__user">
          <UserAvatar :user-id="requestId" :size="18" linked class="notification-avatar" />
          <UserName :user-id="requestId" size="s" />
        </div>
      </template>

      <template #actions>
        <Tooltip placement="top">
          <Button
            square
            size="s"
            variant="gray"
            :loading="loading"
            aria-label="Ignore invite"
            @click="handleIgnore"
          >
            <Icon name="ph:x" />
          </Button>
          <template #tooltip>
            <p>Ignore invite</p>
          </template>
        </Tooltip>
        <Tooltip placement="top">
          <Button
            square
            size="s"
            variant="accent"
            :loading="loading"
            aria-label="Accept invite"
            @click="handleAccept"
          >
            <Icon name="ph:check" />
          </Button>
          <template #tooltip>
            <p>Accept invite</p>
          </template>
        </Tooltip>
      </template>
    </NotificationCard>
  </UserPreviewHover>
</template>

<style lang="scss" scoped>
.notification-card-invite {
  &__hover-wrapper {
    display: block;
    width: 100%;
  }

  &__user {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xxs);
    cursor: default;

    :deep(.vui-avatar) {
      span {
        font-size: var(--font-size-xxs);
      }
    }
  }
}
</style>
