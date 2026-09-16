<script setup lang="ts">
import type { SubscriptionRow } from '@/composables/useDiscussionSubscriptionsCache'
import type { Database } from '@/types/database.types'
import { Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import HomeDashboardCardHeader from '@/components/Home/HomeDashboardCardHeader.vue'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import HomeDashboardSkeleton from '@/components/Home/HomeDashboardSkeleton.vue'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { SUBSCRIPTION_SELECT, useDiscussionSubscriptionsCache } from '@/composables/useDiscussionSubscriptionsCache'
import { useForumFeedPreview } from '@/composables/useForumFeedPreview'
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

// My subscriptions with their discussion titles, out of the same cache the
// notification sheet subscriptions tab fills.
const subscriptionsCache = useDiscussionSubscriptionsCache()
const allSubscriptions = ref<SubscriptionRow[]>([])
const subscriptionsLoading = ref(true)

// Zero until we've talked to the database ourselves. A cache hit doesn't count
// - the rows behind it can already be most of the cache TTL old, so the first
// tab-back should still go and look.
let lastFetchedAt = 0

// Only real threads belong in the forum card. A subscription to a profile,
// gameserver, vote or theme lives on that entity's page, so it reads as a
// broken thread here - those stay in the notification sheet's tab.
const visibleSubscriptions = computed(() =>
  allSubscriptions.value
    .filter(sub => sub.discussion != null && getDiscussionEntityHref(sub.discussion) === null),
)

// A thread is unread when it moved on after the last time I opened it. Own
// replies don't count - `last_seen_at` only advances on a visit, so posting and
// walking away would otherwise dot my own thread.
function hasNewActivity(sub: SubscriptionRow): boolean {
  const activity = sub.discussion?.last_activity_at
  if (activity == null || activity === '')
    return false

  if (sub.discussion?.last_activity_by != null && sub.discussion.last_activity_by === userId.value)
    return false

  return dayjs(activity).isAfter(dayjs(sub.last_seen_at))
}

// Unread first, then newest activity. The card only has room for four, so the
// threads that moved since I last looked are the ones worth the slots.
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

// The forum index setting owns whether unread gets a dot at all. Ordering isn't
// gated on it - a quiet reshuffle costs nothing and still puts the live threads
// first.
const showUnreadMarkers = computed(() => settings.value.show_forum_unread_bubbles)

// Counts every unread subscription, not just the four on screen, so the label
// doesn't undercount what's waiting behind the cut.
const unreadSubscriptionCount = computed(() =>
  showUnreadMarkers.value
    ? visibleSubscriptions.value.filter(hasNewActivity).length
    : 0,
)

// Same select and order as the notification sheet, unlimited on purpose: a
// limited fetch written into the shared cache would truncate the sheet's list.
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

  // A cache hit paints immediately, so the skeleton never gets a chance to
  // flash on a warm load.
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

// Nothing pushes subscription activity at us, so a dashboard sitting in a
// background tab keeps showing whatever was true when it loaded. Catch up when
// the tab comes back. Deliberately silent: the list is already on screen, and
// blanking it into a skeleton for a refresh is what the old notification
// section did wrong.
const { isHidden } = usePageVisibility()

watch(isHidden, (hidden) => {
  const uid = userId.value
  if (hidden || uid == null)
    return

  if (Date.now() - lastFetchedAt >= REFRESH_INTERVAL_MS)
    void fetchSubscriptions(uid)
})

// Latest activity across the whole forum.
const {
  items: latestItems,
  loading: latestLoading,
  mentionLookup: latestMentionLookup,
} = useForumFeedPreview({
  limit: PREVIEW_LIMIT,
  cacheKey: 'dashboard-forum:latest',
})
</script>

<template>
  <Flex column gap="m">
    <HomeDashboardCardHeader title="Forum" icon="ph:chats-circle" to="/forum" />

    <HomeDashboardSkeleton v-if="subscriptionsLoading && !subscriptions.length" variant="grid" :count="4" />
    <HomeDashboardSection v-else-if="subscriptions.length" :label="unreadSubscriptionCount ? `Your subscriptions (${unreadSubscriptionCount} new)` : 'Your subscriptions'">
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
    <HomeDashboardSection v-else-if="latestItems.length" label="Latest across the forum">
      <Flex column gap="xs">
        <HomeForumItem
          v-for="item in latestItems"
          :key="item.id"
          :post="item"
          :mention-lookup="latestMentionLookup"
        />
      </Flex>
    </HomeDashboardSection>
  </Flex>
</template>

<style scoped lang="scss">
// Same dot as the forum index uses for a topic with new posts, so the two
// places agree on what "unread" looks like.
.home-item--unread {
  position: relative;
  border-color: var(--color-border);

  &::after {
    content: '';
    position: absolute;
    top: var(--space-xs);
    right: var(--space-xs);
    width: 8px;
    height: 8px;
    border-radius: var(--border-radius-pill);
    background: var(--color-accent);
  }

  strong {
    // Leave the dot its corner instead of running the title underneath it.
    padding-right: var(--space-m);
  }

  span {
    color: var(--color-text-light);
  }
}
</style>
