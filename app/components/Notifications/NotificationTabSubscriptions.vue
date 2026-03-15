<script setup lang="ts">
import type { Database } from '@/types/database.types'
import { Flex } from '@dolanske/vui'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import NotificationCardEmpty from './NotificationCardEmpty.vue'
import NotificationCardError from './NotificationCardError.vue'
import NotificationCardLoading from './NotificationCardLoading.vue'
import NotificationCardSubscription from './NotificationCardSubscription.vue'

interface SubscriptionRow {
  id: string
  discussion_id: string
  last_seen_at: string
  discussion: {
    title: string
    slug: string | null
  } | null
}

const emit = defineEmits<{ (e: 'navigate'): void }>()

const supabase = useSupabaseClient<Database>()
const userId = useUserId()

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
        discussion: { title: 'General Discussion', slug: 'general-discussion' },
      },
      {
        id: 'dev-sub-2',
        discussion_id: 'dev-discussion-2',
        last_seen_at: new Date(Date.now() - 86400000).toISOString(),
        discussion: { title: 'Site Feedback', slug: 'site-feedback' },
      },
      {
        id: 'dev-sub-3',
        discussion_id: 'dev-discussion-3',
        last_seen_at: new Date(Date.now() - 172800000).toISOString(),
        discussion: { title: 'A very long discussion title that should get truncated', slug: 'long-title' },
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

  loading.value = true
  error.value = null

  try {
    // @ts-expect-error discussion_subscriptions not yet in generated database types
    const { data, error: fetchError } = await supabase.from('discussion_subscriptions')
      .select('id, discussion_id, last_seen_at, discussion:discussions(title, slug)')
      .eq('user_id', userId.value as string)
      .order('last_seen_at', { ascending: false })

    if (fetchError)
      throw fetchError

    subscriptions.value = (data ?? []) as unknown as SubscriptionRow[]
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

  // @ts-expect-error discussion_subscriptions not yet in generated database types
  const { error: deleteError } = await supabase.from('discussion_subscriptions')
    .delete()
    .eq('id', sub.id)

  if (!deleteError)
    subscriptions.value = subscriptions.value.filter(s => s.id !== sub.id)

  unsubscribeLoading.value = { ...unsubscribeLoading.value, [sub.id]: false }
}

async function clearAll() {
  if (!userId.value)
    return

  clearAllLoading.value = true

  // @ts-expect-error discussion_subscriptions not yet in generated database types
  const { error: deleteError } = await supabase.from('discussion_subscriptions')
    .delete()
    .eq('user_id', userId.value as string)

  if (!deleteError)
    subscriptions.value = []

  clearAllLoading.value = false
}

function triggerClearAll() {
  confirmOpen.value = true
}

function getHref(sub: SubscriptionRow): string {
  return `/forum/${sub.discussion?.slug ?? sub.discussion_id}`
}

function handleClick() {
  emit('navigate')
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
        :title="sub.discussion?.title ?? 'Unknown discussion'"
        :href="getHref(sub)"
        :loading="!!unsubscribeLoading[sub.id]"
        @click="handleClick"
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
