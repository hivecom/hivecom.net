<script setup lang="ts">
import type { ForumLatestPane } from '@/components/Forum/ForumLatestSheet.vue'
import type { SubscriptionRow } from '@/composables/useDiscussionSubscriptionsCache'
import type { Database } from '@/types/database.types'
import { Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import ForumLatestSheet from '@/components/Forum/ForumLatestSheet.vue'
import HomeDashboardCardHeader from '@/components/Home/HomeDashboardCardHeader.vue'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import HomeDashboardSkeleton from '@/components/Home/HomeDashboardSkeleton.vue'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { SUBSCRIPTION_SELECT, useDiscussionSubscriptionsCache } from '@/composables/useDiscussionSubscriptionsCache'
import { useForumFeedPreview } from '@/composables/useForumFeedPreview'
import { useNotificationSheet } from '@/composables/useNotificationSheet'
import { usePageVisibility } from '@/composables/usePageVisibility'
import { useUserId } from '@/composables/useUserId'
import { getDiscussionEntityHref } from '@/lib/discussions'
import HomeForumItem from './HomeForumItem.vue'

dayjs.extend(relativeTime)

const PREVIEW_LIMIT = 3
const SUBSCRIPTION_LIMIT = 4

// How old the list may be before a tab-back refetches it.
const REFRESH_INTERVAL_MS = 60 * 1000

const supabase = useSupabaseClient<Database>()
const userId = useUserId()
const { settings } = useDataUserSettings()
const { openTo: openNotifications } = useNotificationSheet()

// Shares its cache with the notification sheet's subscriptions tab
const subscriptionsCache = useDiscussionSubscriptionsCache()
const allSubscriptions = ref<SubscriptionRow[]>([])
const subscriptionsLoading = ref(true)

// A cache hit doesn't count: its rows can be most of the TTL old, so the first
// tab-back still refetches
let lastFetchedAt = 0

// Entity discussions (profiles, gameservers, votes) read as broken threads here.
// They stay in the notification sheet.
const visibleSubscriptions = computed(() =>
  allSubscriptions.value
    .filter(sub => sub.discussion != null && getDiscussionEntityHref(sub.discussion) === null),
)

// Own replies don't count. `last_seen_at` only advances on a visit, so posting
// and walking away would otherwise dot my own thread.
function hasNewActivity(sub: SubscriptionRow): boolean {
  const activity = sub.discussion?.last_activity_at
  if (activity == null || activity === '')
    return false

  if (sub.discussion?.last_activity_by != null && sub.discussion.last_activity_by === userId.value)
    return false

  return dayjs(activity).isAfter(dayjs(sub.last_seen_at))
}

// Unread first, since the card only has four slots
const subscriptions = computed(() =>
  visibleSubscriptions.value
    .map(sub => ({ sub, unread: hasNewActivity(sub) }))
    .sort((a, b) => {
      if (a.unread !== b.unread)
        return a.unread ? -1 : 1

      return (b.sub.discussion?.last_activity_at ?? '').localeCompare(a.sub.discussion?.last_activity_at ?? '')
    })
    .slice(0, SUBSCRIPTION_LIMIT),
)

// Only the dot follows this setting. The unread-first ordering always applies.
const showUnreadMarkers = computed(() => settings.value.show_forum_unread_bubbles)

// Counts past the four on screen
const unreadSubscriptionCount = computed(() =>
  showUnreadMarkers.value
    ? visibleSubscriptions.value.filter(hasNewActivity).length
    : 0,
)

// Unlimited on purpose: a limited fetch in the shared cache would truncate the
// notification sheet's list
async function fetchSubscriptions(uid: string) {
  const { data, error } = await supabase.from('discussion_subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .eq('user_id', uid)
    .order('last_seen_at', { ascending: false })

  lastFetchedAt = Date.now()

  // Don't cache on failure, otherwise an empty list sticks for the whole TTL.
  if (error != null)
    return

  const rows = (data ?? []) as unknown as SubscriptionRow[]
  allSubscriptions.value = rows
  subscriptionsCache.setList(uid, rows)
}

watch(userId, async (uid) => {
  if (uid == null) {
    allSubscriptions.value = []
    subscriptionsLoading.value = false
    return
  }

  const cached = subscriptionsCache.getList(uid)
  if (cached !== null) {
    allSubscriptions.value = cached
    subscriptionsLoading.value = false
    return
  }

  subscriptionsLoading.value = true
  await fetchSubscriptions(uid)
  subscriptionsLoading.value = false
}, { immediate: true })

// Nothing pushes subscription activity, so catch up on tab-back. Silent on
// purpose: the list is on screen, and a skeleton flash would be worse.
const { isHidden } = usePageVisibility()

watch(isHidden, (hidden) => {
  const uid = userId.value
  if (hidden || uid == null)
    return

  if (Date.now() - lastFetchedAt >= REFRESH_INTERVAL_MS)
    void fetchSubscriptions(uid)
})

// Minus my own posts, since three slots are too few to spend on them
const {
  items: latestItems,
  allItems: latestAllItems,
  loading: latestLoading,
  loadingMore: latestLoadingMore,
  exhausted: latestExhausted,
  loadMore: loadMoreLatest,
  mentionLookup: latestMentionLookup,
} = useForumFeedPreview({
  limit: PREVIEW_LIMIT,
  cacheKey: 'dashboard-forum:latest',
  excludeOwn: true,
})

// Pages on from the preview's own fetch. No tabs or visit divider, since the
// dashboard doesn't track forum visits.
const latestSheetOpen = ref(false)

const latestPane = computed<ForumLatestPane>(() => ({
  items: latestAllItems.value,
  loading: latestLoading.value,
  loadingMore: latestLoadingMore.value,
  exhausted: latestExhausted.value,
}))

function openLatestSheet(): void {
  latestSheetOpen.value = true
}
</script>

<template>
  <Flex column gap="m">
    <HomeDashboardCardHeader title="Forum" icon="ph:chats-circle" to="/forum" />

    <HomeDashboardSkeleton v-if="subscriptionsLoading && !subscriptions.length" variant="grid" :count="4" />
    <!-- The full list lives in the notification sheet -->
    <HomeDashboardSection
      v-else-if="subscriptions.length"
      :label="unreadSubscriptionCount ? `Your subscriptions (${unreadSubscriptionCount} new)` : 'Your subscriptions'"
      @click="openNotifications('subscriptions')"
    >
      <div class="home-item-list">
        <NuxtLink
          v-for="{ sub, unread } in subscriptions"
          :key="sub.id"
          :to="`/forum/${sub.discussion?.slug ?? sub.discussion_id}`"
          class="home-item"
          :class="{ 'home-item--unread': unread && showUnreadMarkers }"
        >
          <strong>
            {{ sub.discussion?.title ?? sub.discussion_id }}
          </strong>
          <span v-if="sub.discussion?.last_activity_at">active {{ dayjs(sub.discussion.last_activity_at).fromNow() }}</span>
        </NuxtLink>
      </div>
    </HomeDashboardSection>

    <HomeDashboardSkeleton v-if="latestLoading && !latestItems.length" variant="rows" :count="3" />
    <HomeDashboardSection
      v-else-if="latestItems.length"
      label="Latest across the forum"
      @click="openLatestSheet"
    >
      <Flex column gap="xs">
        <HomeForumItem
          v-for="item in latestItems"
          :key="item.id"
          :post="item"
          :mention-lookup="latestMentionLookup"
        />
      </Flex>
    </HomeDashboardSection>

    <ForumLatestSheet
      :open="latestSheetOpen"
      title="Latest across the forum"
      :feed="latestPane"
      :mention-lookup="latestMentionLookup"
      @close="latestSheetOpen = false"
      @load-more="loadMoreLatest"
    />
  </Flex>
</template>

<style scoped lang="scss">
// The dot alone marks unread. The brighter outline is for hover.
.home-item--unread {
  position: relative;

  &::after {
    content: '';
    position: absolute;
    top: var(--space-xs);
    right: var(--space-xs);
    width: 4px;
    height: 4px;
    border-radius: var(--border-radius-pill);
    background: var(--color-accent);
  }

  strong {
    // Leaves the dot its corner
    padding-right: var(--space-m);
  }

  span {
    color: var(--color-text-light);
  }
}
</style>
