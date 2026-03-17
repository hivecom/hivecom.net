<script setup lang="ts">
import type { NotificationRow } from '@/composables/useDataNotifications'
import { Button, Flex, Tooltip } from '@dolanske/vui'
import { useNotifications } from '@/composables/useDataNotifications'
import NotificationCard from './NotificationCard.vue'
import NotificationCardBirthday from './NotificationCardBirthday.vue'
import NotificationCardEmpty from './NotificationCardEmpty.vue'
import NotificationCardError from './NotificationCardError.vue'
import NotificationCardInvite from './NotificationCardInvite.vue'
import NotificationCardLoading from './NotificationCardLoading.vue'
import NotificationCardPendingComplaints from './NotificationCardPendingComplaints.vue'

const emit = defineEmits<{ (e: 'navigate'): void }>()

const supabase = useSupabaseClient()
const userId = useUserId()

const {
  loading,
  error,
  pendingRequestIds,
  birthdayWidget,
  pendingComplaintCount,
  discussionNotifications,
  mentionNotifications,
  replyNotifications,
  fetch,
  markAllAsRead,
  handleInviteAction,
  handleNotificationClick,
  isInviteLoading,
} = useNotifications()

const markReadLoading = ref<Record<string, boolean>>({})
const markAllLoading = ref(false)

const isDev = import.meta.dev

// ── Dev fixtures ──────────────────────────────────────────────────────────────
const DEV_FIXTURE_NOTIFICATIONS: NotificationRow[] = import.meta.dev
  ? [
      {
        id: 'dev-discussion',
        user_id: 'dev',
        title: 'zealsprince posted a new reply',
        body: 'In General Discussion',
        href: '/forum/general',
        is_read: false,
        source: 'discussion_reply',
        source_id: 'dev-discussion',
        created_at: new Date(Date.now() - 300000).toISOString(),
        created_by: 'dev',
        modified_at: new Date(Date.now() - 300000).toISOString(),
        modified_by: 'dev',
      },
      {
        id: 'dev-mention',
        user_id: 'dev',
        title: 'zealsprince mentioned you',
        body: 'In Announcements',
        href: '/forum/announcements',
        is_read: false,
        source: 'mention',
        source_id: 'dev-mention',
        created_at: new Date(Date.now() - 3600000).toISOString(),
        created_by: 'dev',
        modified_at: new Date(Date.now() - 3600000).toISOString(),
        modified_by: 'dev',
      },
      {
        id: 'dev-reply',
        user_id: 'dev',
        title: 'zealsprince replied to your comment',
        body: 'In Site Feedback',
        href: '/forum/site-feedback',
        is_read: false,
        source: 'discussion_reply_reply',
        source_id: 'dev-reply',
        created_at: new Date(Date.now() - 86400000).toISOString(),
        created_by: 'dev',
        modified_at: new Date(Date.now() - 86400000).toISOString(),
        modified_by: 'dev',
      },
    ]
  : []

const devFixtureInviteId = computed(() => userId.value ?? '00000000-0000-0000-0000-000000000001')
const DEV_FIXTURE_COMPLAINT_COUNT = 3
const DEV_FIXTURE_BIRTHDAY = {
  title: 'Happy Birthday!',
  description: 'Another year with us around the sun!',
}

const devFixturesActive = defineModel<boolean>('devFixturesActive', { default: false })
const devFixtureError = defineModel<boolean>('devFixtureError', { default: false })
const devFixtureLoading = defineModel<boolean>('devFixtureLoading', { default: false })

const activeNotifications = computed<NotificationRow[]>(() =>
  isDev && devFixturesActive.value ? DEV_FIXTURE_NOTIFICATIONS : [],
)

const activeDiscussionNotifications = computed(() =>
  isDev && devFixturesActive.value
    ? activeNotifications.value.filter(n => n.source === 'discussion_reply')
    : discussionNotifications.value,
)

const activeMentionNotifications = computed(() =>
  isDev && devFixturesActive.value
    ? activeNotifications.value.filter(n => n.source === 'mention')
    : mentionNotifications.value,
)

const activeReplyNotifications = computed(() =>
  isDev && devFixturesActive.value
    ? activeNotifications.value.filter(n => n.source === 'discussion_reply_reply')
    : replyNotifications.value,
)

const actionableNotifications = computed(() => [
  ...activeMentionNotifications.value,
  ...activeReplyNotifications.value,
  ...activeDiscussionNotifications.value,
])

// Pinned = birthday + pending complaints + friend invites
const hasPinned = computed(() => {
  if (isDev && devFixturesActive.value)
    return true
  return (
    pendingRequestIds.value.length > 0
    || Boolean(birthdayWidget.value)
    || pendingComplaintCount.value > 0
  )
})

const hasActionable = computed(() => actionableNotifications.value.length > 0)

const hasAnyNotifications = computed(() =>
  hasPinned.value || hasActionable.value,
)

function iconForSource(source: string | null): string {
  if (source === 'mention')
    return 'ph:at'
  if (source === 'discussion_reply_reply')
    return 'ph:chat-circle'
  return 'ph:chat-circle-dots'
}

const loadingCount = computed(() => {
  if (!loading.value)
    return 0
  const total = pendingRequestIds.value.length
    + (birthdayWidget.value ? 1 : 0)
    + pendingComplaintCount.value
    + discussionNotifications.value.length
    + mentionNotifications.value.length
    + replyNotifications.value.length
  return total > 0 ? total : 1
})

const showEmpty = computed(() => {
  if (isDev && (devFixturesActive.value || devFixtureError.value || devFixtureLoading.value))
    return false
  return !loading.value
    && !error.value
    && pendingRequestIds.value.length === 0
    && !birthdayWidget.value
    && pendingComplaintCount.value === 0
    && discussionNotifications.value.length === 0
    && mentionNotifications.value.length === 0
    && replyNotifications.value.length === 0
})

async function onNotificationClick(notification: NotificationRow) {
  await handleNotificationClick(notification)
  emit('navigate')
  if (notification.href)
    void navigateTo(notification.href)
}

async function onMarkRead(notification: NotificationRow) {
  if (notification.id.startsWith('dev-'))
    return

  markReadLoading.value = { ...markReadLoading.value, [notification.id]: true }

  const { error: updateError } = await supabase.from('notifications')
    .update({ is_read: true })
    .eq('id', notification.id)

  if (!updateError)
    await handleNotificationClick(notification)

  markReadLoading.value = { ...markReadLoading.value, [notification.id]: false }
}

async function onMarkAllAsRead() {
  markAllLoading.value = true
  await markAllAsRead()
  markAllLoading.value = false
}

defineExpose({ markAllAsRead: onMarkAllAsRead, markAllLoading, hasAnyNotifications, hasActionable })
</script>

<template>
  <Flex column gap="xs" expand>
    <template v-if="(isDev && devFixtureLoading) || loading">
      <NotificationCardLoading :loading-count />
      <NotificationCardLoading v-if="isDev && devFixtureLoading && loadingCount === 0" />
    </template>

    <template v-else>
      <NotificationCardError
        v-if="(isDev && devFixtureError) || error"
        class="mb-m"
        @retry="devFixtureError ? undefined : fetch"
      />

      <!-- Pinned section -->
      <template v-if="hasPinned">
        <span class="text-s text-color-lighter block">Actions</span>

        <NotificationCardInvite
          v-if="isDev && devFixturesActive"
          :request-id="devFixtureInviteId"
          :loading="false"
        />
        <NotificationCardInvite
          v-for="requestId in pendingRequestIds"
          :key="`invite-${requestId}`"
          :request-id="requestId"
          :loading="isInviteLoading(requestId)"
          @accept="handleInviteAction(requestId, 'accept')"
          @ignore="handleInviteAction(requestId, 'ignore')"
        />

        <NotificationCardBirthday
          v-if="(isDev && devFixturesActive) || birthdayWidget"
          :title="(isDev && devFixturesActive) ? DEV_FIXTURE_BIRTHDAY.title : birthdayWidget!.title"
          :description="(isDev && devFixturesActive) ? DEV_FIXTURE_BIRTHDAY.description : birthdayWidget!.description"
          to="/profile"
        />

        <NotificationCardPendingComplaints
          v-if="(isDev && devFixturesActive) || pendingComplaintCount > 0"
          :count="(isDev && devFixturesActive) ? DEV_FIXTURE_COMPLAINT_COUNT : pendingComplaintCount"
          to="/admin/complaints"
        />
        <div class="block mb-s" />
      </template>

      <!-- Regular actionable notifications -->
      <span v-if="hasActionable" class="text-s text-color-lighter">Recent</span>
      <NotificationCard
        v-for="notification in actionableNotifications"
        :key="`active-${notification.id}`"
        :icon="iconForSource(notification.source)"
        :text="notification.title"
        :description="notification.body"
        :timestamp="notification.modified_at"
        clickable
        @click="onNotificationClick(notification)"
      >
        <template #actions>
          <Tooltip placement="left">
            <Button
              size="s"
              square
              :aria-label="markReadLoading[notification.id] ? 'Marking as read...' : 'Mark as read'"
              :disabled="!!markReadLoading[notification.id]"
              @click.stop="onMarkRead(notification)"
            >
              <Icon v-if="markReadLoading[notification.id]" name="ph:spinner" class="notification-tab__mark-read-icon--spin" />
              <Icon v-else name="ph:check" :size="18" />
            </Button>
            <template #tooltip>
              {{ markReadLoading[notification.id] ? 'Marking as read...' : 'Mark as read' }}
            </template>
            <Tooltip />
          </tooltip>
        </template>
      </NotificationCard>

      <NotificationCardEmpty v-if="showEmpty" />
    </template>
  </Flex>
</template>

<style lang="scss" scoped>
.notification-tab {
  &__pinned-divider {
    margin: var(--space-xxs) 0;
  }

  &__divider-label {
    font-size: var(--font-size-xxs);
    color: var(--color-text-lighter);
    text-transform: uppercase;
    // letter-spacing: 0.05em;
    padding: 0 var(--space-xs);
    background-color: var(--color-bg);
    z-index: 1;
    // Fix vertical offset
    display: block;
    margin-top: -2px;
  }

  &__mark-read-icon {
    &--spin {
      animation: spin 1s linear infinite;
    }
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
