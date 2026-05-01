<script setup lang="ts">
import type { NotificationRow } from '@/composables/useDataNotifications'
import type { Database } from '@/types/database.types'
import { Button, Flex } from '@dolanske/vui'
import { sourceIcon } from '@/composables/useDataNotifications'
import NotificationCard from './NotificationCard.vue'
import NotificationCardEmpty from './NotificationCardEmpty.vue'
import NotificationCardError from './NotificationCardError.vue'
import NotificationCardLoading from './NotificationCardLoading.vue'

const emit = defineEmits<{ (e: 'navigate'): void }>()

const supabase = useSupabaseClient<Database>()
const userId = useUserId()

const loading = ref(false)
const error = ref<string | null>(null)
const notifications = ref<NotificationRow[]>([])
const loaded = ref(false)
const deleteLoading = ref<Record<string, boolean>>({})
const clearAllLoading = ref(false)

const isDev = import.meta.dev

// ── Dev fixtures ──────────────────────────────────────────────────────────────
const DEV_FIXTURE_READ: NotificationRow[] = import.meta.dev
  ? [
      {
        id: 'dev-read-1',
        user_id: 'dev',
        title: 'zealsprince replied to your comment',
        body: 'In Old Thread',
        href: '/forum/old-thread',
        is_read: true,
        source: 'discussion_reply_reply',
        source_id: 'dev-read-1',
        created_at: new Date(Date.now() - 86400000).toISOString(),
        created_by: 'dev',
        modified_at: new Date(Date.now() - 86400000).toISOString(),
        modified_by: 'dev',
      },
      {
        id: 'dev-read-2',
        user_id: 'dev',
        title: 'zealsprince mentioned you',
        body: 'In Old Announcements',
        href: '/forum/old-announcements',
        is_read: true,
        source: 'mention',
        source_id: 'dev-read-2',
        created_at: new Date(Date.now() - 172800000).toISOString(),
        created_by: 'dev',
        modified_at: new Date(Date.now() - 172800000).toISOString(),
        modified_by: 'dev',
      },
      {
        id: 'dev-read-3',
        user_id: 'dev',
        title: 'zealsprince posted a new reply',
        body: 'In Old General Discussion',
        href: '/forum/old-general',
        is_read: true,
        source: 'discussion_reply',
        source_id: 'dev-read-3',
        created_at: new Date(Date.now() - 259200000).toISOString(),
        created_by: 'dev',
        modified_at: new Date(Date.now() - 259200000).toISOString(),
        modified_by: 'dev',
      },
    ]
  : []

const devFixturesActive = defineModel<boolean>('devFixturesActive', { default: false })

const activeNotifications = computed<NotificationRow[]>(() =>
  isDev && devFixturesActive.value ? DEV_FIXTURE_READ : notifications.value,
)

const hasNotifications = computed(() => activeNotifications.value.length > 0)

const showEmpty = computed(() =>
  !loading.value
  && !error.value
  && !hasNotifications.value
  && !(isDev && devFixturesActive.value),
)

async function load() {
  if (!userId.value || loaded.value)
    return

  loading.value = true
  error.value = null

  try {
    const { data, error: fetchError } = await supabase.from('notifications')
      .select('*')
      .eq('user_id', userId.value as string)
      .eq('is_read', true)
      .order('modified_at', { ascending: false })
      .limit(30)

    if (fetchError)
      throw fetchError

    notifications.value = (data ?? []) as unknown as NotificationRow[]
    loaded.value = true
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load read notifications'
  }
  finally {
    loading.value = false
  }
}

function reset() {
  notifications.value = []
  loaded.value = false
  error.value = null
}

async function deleteNotification(notification: NotificationRow) {
  if (notification.id.startsWith('dev-'))
    return

  deleteLoading.value = { ...deleteLoading.value, [notification.id]: true }

  const { error: deleteError } = await supabase.from('notifications')
    .delete()
    .eq('id', notification.id)

  if (!deleteError)
    notifications.value = notifications.value.filter(n => n.id !== notification.id)

  deleteLoading.value = { ...deleteLoading.value, [notification.id]: false }
}

async function clearAll() {
  if (!userId.value)
    return

  clearAllLoading.value = true

  const { error: deleteError } = await supabase.from('notifications')
    .delete()
    .eq('user_id', userId.value as string)
    .eq('is_read', true)

  if (!deleteError)
    notifications.value = []

  clearAllLoading.value = false
}

function onNotificationClick(notification: NotificationRow) {
  emit('navigate')
  if (notification.href) {
    const needsCommentAnchor
      = (notification.source === 'discussion_reply_reply' || notification.source === 'mention')
        && notification.source_id

    const target = needsCommentAnchor
      ? `${notification.href}?comment=${notification.source_id}`
      : notification.href

    void navigateTo(target)
  }
}

defineExpose({ load, reset, clearAll, clearAllLoading, hasNotifications })
</script>

<template>
  <Flex column gap="xs" expand>
    <template v-if="loading">
      <NotificationCardLoading />
    </template>

    <template v-else>
      <NotificationCardError v-if="error" @retry="load" />

      <NotificationCard
        v-for="notification in activeNotifications"
        :key="`past-${notification.id}`"
        :icon="sourceIcon(notification.source)"
        :text="notification.title"
        :description="notification.body"
        :timestamp="notification.modified_at"
        clickable
        @click="onNotificationClick(notification)"
      >
        <template #actions>
          <Button
            size="s"
            square
            :aria-label="deleteLoading[notification.id] ? 'Deleting...' : 'Delete notification'"
            :disabled="!!deleteLoading[notification.id]"
            @click.stop="deleteNotification(notification)"
          >
            <Icon
              :name="deleteLoading[notification.id] ? 'ph:spinner' : 'ph:trash'"
              :size="20"
              :class="{ 'notification-tab-past__delete-icon--spin': deleteLoading[notification.id] }"
            />
          </Button>
        </template>
      </NotificationCard>

      <NotificationCardEmpty v-if="showEmpty" message="No past notifications" />
    </template>
  </Flex>
</template>

<style lang="scss" scoped>
.notification-tab-past {
  &__delete-icon--spin {
    animation: spin 1s linear infinite;
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
