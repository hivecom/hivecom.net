<script setup lang="ts">
import type { SubscriptionRow } from '@/composables/useDiscussionSubscriptionsCache'
import type { Database } from '@/types/database.types'
import { Flex } from '@dolanske/vui'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { useDiscussionSubscriptionsCache } from '@/composables/useDiscussionSubscriptionsCache'
import NotificationCardEmpty from './NotificationCardEmpty.vue'
import NotificationCardError from './NotificationCardError.vue'
import NotificationCardLoading from './NotificationCardLoading.vue'
import NotificationCardSubscription from './NotificationCardSubscription.vue'

const emit = defineEmits<{ (e: 'navigate'): void }>()

const supabase = useSupabaseClient<Database>()
const userId = useUserId()
const subscriptionsCache = useDiscussionSubscriptionsCache()

const loading = ref(false)
const error = ref<string | null>(null)
const subscriptions = ref<SubscriptionRow[]>([])
const loaded = ref(false)
const unsubscribeLoading = ref<Record<string, boolean>>({})
const clearAllLoading = ref(false)
const confirmOpen = ref(false)

const isDev = import.meta.dev

// ── Dev fixtures ──────────────────────────────────────────────────────────────
const DEV_FIXTURE_SUBSCRIPTIONS: SubscriptionRow[] = import.meta.dev
  ? [
      {
        id: 'dev-sub-1',
        discussion_id: 'dev-discussion-1',
        last_seen_at: new Date().toISOString(),
        discussion: { title: 'General Discussion', slug: 'general-discussion', profile_id: null, event_id: null, gameserver_id: null, project_id: null, referendum_id: null, theme_id: null },
      },
      {
        id: 'dev-sub-2',
        discussion_id: 'dev-discussion-2',
        last_seen_at: new Date(Date.now() - 86400000).toISOString(),
        discussion: { title: 'Site Feedback', slug: 'site-feedback', profile_id: null, event_id: null, gameserver_id: null, project_id: null, referendum_id: null, theme_id: null },
      },
      {
        id: 'dev-sub-3',
        discussion_id: 'dev-discussion-3',
        last_seen_at: new Date(Date.now() - 172800000).toISOString(),
        discussion: { title: 'A very long discussion title that should get truncated', slug: 'long-title', profile_id: null, event_id: null, gameserver_id: null, project_id: null, referendum_id: null, theme_id: null },
      },
    ]
  : []

const devFixturesActive = defineModel<boolean>('devFixturesActive', { default: false })

const activeSubscriptions = computed<SubscriptionRow[]>(() =>
  isDev && devFixturesActive.value ? DEV_FIXTURE_SUBSCRIPTIONS : subscriptions.value,
)

const hasSubscriptions = computed(() => activeSubscriptions.value.length > 0)

const showEmpty = computed(() =>
  !loading.value
  && !error.value
  && activeSubscriptions.value.length === 0
  && !(isDev && devFixturesActive.value),
)

async function load() {
  if (!userId.value || loaded.value)
    return

  // Check cache first
  const cached = subscriptionsCache.getList(userId.value)
  if (cached !== null) {
    subscriptions.value = cached
    loaded.value = true
    return
  }

  loading.value = true
  error.value = null

  try {
    const { data, error: fetchError } = await supabase.from('discussion_subscriptions')
      .select('id, discussion_id, last_seen_at, discussion:discussions(title, slug, profile_id, event_id, gameserver_id, project_id, referendum_id, theme_id)')
      .eq('user_id', userId.value as string)
      .order('last_seen_at', { ascending: false })

    if (fetchError)
      throw fetchError

    const rows = (data ?? []) as unknown as SubscriptionRow[]
    subscriptions.value = rows
    subscriptionsCache.setList(userId.value, rows)
    loaded.value = true
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load subscriptions'
  }
  finally {
    loading.value = false
  }
}

function reset() {
  subscriptions.value = []
  loaded.value = false
  error.value = null
}

async function handleUnsubscribe(sub: SubscriptionRow) {
  if (!userId.value || unsubscribeLoading.value[sub.id] || sub.id.startsWith('dev-'))
    return

  unsubscribeLoading.value = { ...unsubscribeLoading.value, [sub.id]: true }

  const { error: deleteError } = await supabase.from('discussion_subscriptions')
    .delete()
    .eq('id', sub.id)

  if (!deleteError) {
    subscriptions.value = subscriptions.value.filter(s => s.id !== sub.id)
    subscriptionsCache.applyUnsubscribe(userId.value, sub.id, sub.discussion_id)
  }

  unsubscribeLoading.value = { ...unsubscribeLoading.value, [sub.id]: false }
}

async function clearAll() {
  if (!userId.value)
    return

  clearAllLoading.value = true

  const { error: deleteError } = await supabase.from('discussion_subscriptions')
    .delete()
    .eq('user_id', userId.value as string)

  if (!deleteError) {
    subscriptions.value = []
    subscriptionsCache.applyUnsubscribeAll(userId.value)
  }

  clearAllLoading.value = false
}

function triggerClearAll() {
  confirmOpen.value = true
}

function getSubscriptionIcon(sub: SubscriptionRow): string {
  const d = sub.discussion
  if (!d)
    return 'ph:bell-ringing'
  if (d.profile_id)
    return 'ph:user-circle'
  if (d.event_id)
    return 'ph:calendar'
  if (d.gameserver_id)
    return 'ph:desktop-tower'
  if (d.project_id)
    return 'ph:blueprint'
  if (d.referendum_id)
    return 'ph:scales'
  if (d.theme_id)
    return 'ph:paint-brush'
  return 'ph:chat-dots'
}

function getSubscriptionTitle(sub: SubscriptionRow): string {
  const title = sub.discussion?.title ?? 'Unknown discussion'
  const d = sub.discussion
  if (!d)
    return title
  if (d.profile_id)
    return `Profile - ${title}`
  if (d.event_id)
    return `Event - ${title}`
  if (d.gameserver_id)
    return `Game Server - ${title}`
  if (d.project_id)
    return `Project - ${title}`
  if (d.referendum_id)
    return `Vote - ${title}`
  if (d.theme_id)
    return `Theme - ${title}`
  return title
}

defineExpose({ load, reset, triggerClearAll, clearAllLoading, hasSubscriptions })
</script>

<template>
  <Flex column gap="xs" expand>
    <template v-if="loading">
      <NotificationCardLoading />
    </template>

    <template v-else>
      <NotificationCardError v-if="error" @retry="load" />

      <NotificationCardSubscription
        v-for="sub in activeSubscriptions"
        :key="`sub-${sub.id}`"
        :title="getSubscriptionTitle(sub)"
        :icon="getSubscriptionIcon(sub)"
        :href="sub.discussion?.profile_id ? `/profile/${sub.discussion.profile_id}` : sub.discussion?.theme_id ? `/themes/${sub.discussion.theme_id}` : `/forum/${sub.discussion?.slug ?? sub.discussion_id}`"
        :loading="!!unsubscribeLoading[sub.id]"
        @click="emit('navigate')"
        @unsubscribe="handleUnsubscribe(sub)"
      />

      <NotificationCardEmpty v-if="showEmpty" message="No subscriptions" />
    </template>
  </Flex>

  <ConfirmModal
    v-model:open="confirmOpen"
    title="Clear subscriptions"
    description="This will unsubscribe you from all discussions. This cannot be undone."
    confirm-text="Clear all"
    cancel-text="Cancel"
    :confirm-loading="clearAllLoading"
    :destructive="true"
    @confirm="clearAll"
  />
</template>
