<script setup lang="ts">
import type { NotificationRow } from '@/composables/useDataNotifications'
import type { SubscriptionRow } from '@/composables/useDiscussionSubscriptionsCache'
import type { ActivityItem } from '@/composables/useForumActivityFeed'
import type { Database } from '@/types/database.types'
import { Flex, Skeleton } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import { sourceIcon, useDataNotifications } from '@/composables/useDataNotifications'
import { useForumFeedPreview } from '@/composables/useForumFeedPreview'
import { useUserId } from '@/composables/useUserId'
import HomeForumItem from './HomeForumItem.vue'

dayjs.extend(relativeTime)

const PREVIEW_LIMIT = 3

const supabase = useSupabaseClient<Database>()
const userId = useUserId()
const { discussionNotifications, replyNotifications, mentionNotifications } = useDataNotifications()

function toActivityItem(notification: NotificationRow): ActivityItem {
  const contextInTitle = notification.source === 'discussion_reply'

  return {
    id: notification.id,
    // Not 'Reply' on purpose - these are pre-rendered sentences, not markdown.
    type: 'Discussion',
    typeLabel: contextInTitle ? `In ${notification.title}` : (notification.body ?? 'Forum'),
    title: contextInTitle ? (notification.body ?? notification.title) : notification.title,
    timestamp: dayjs(notification.created_at).fromNow(),
    timestampRaw: notification.created_at,
    user: notification.created_by ?? '',
    icon: sourceIcon(notification.source),
    href: notification.href ?? undefined,
  }
}

// Unread notifications about my posts, newest first.
const myActivity = computed<ActivityItem[]>(() =>
  [...discussionNotifications.value, ...replyNotifications.value, ...mentionNotifications.value]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, PREVIEW_LIMIT)
    .map(toActivityItem),
)

// Notification copy is generated server-side, so there's nothing to resolve.
const noMentions: Record<string, string> = {}

// My subscriptions with their discussion titles - same select the
// notification sheet subscriptions tab uses.
const subscriptions = ref<SubscriptionRow[]>([])

watch(userId, async (uid) => {
  if (uid == null)
    return
  const { data } = await supabase.from('discussion_subscriptions')
    .select('id, discussion_id, last_seen_at, discussion:discussions(title, slug, profile_id, event_id, gameserver_id, project_id, referendum_id, theme_id)')
    .eq('user_id', uid)
    .order('last_seen_at', { ascending: false })
    .limit(6)
  subscriptions.value = (data ?? []) as unknown as SubscriptionRow[]
}, { immediate: true })

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
    <HomeDashboardSection label="Activity on your posts">
      <Flex v-if="myActivity.length" column gap="xs">
        <HomeForumItem
          v-for="item in myActivity"
          :key="item.id"
          :post="item"
          :mention-lookup="noMentions"
          expand
        />
      </Flex>
      <p v-else>
        Nothing new on your posts.
      </p>
    </HomeDashboardSection>

    <HomeDashboardSection label="Your subscriptions">
      <div v-if="subscriptions.length" class="home-item-list">
        <NuxtLink v-for="sub in subscriptions" :key="sub.id" :to="`/forum/${sub.discussion?.slug ?? sub.discussion_id}`" class="home-item">
          <strong>
            {{ sub.discussion?.title ?? sub.discussion_id }}
          </strong>
          <span>updated {{ dayjs(sub.last_seen_at).fromNow() }}</span>
        </NuxtLink>
      </div>
      <p v-else>
        No subscriptions.
      </p>
    </HomeDashboardSection>

    <HomeDashboardSection label="Latest across the forum">
      <Flex v-if="latestLoading" column gap="xs">
        <Skeleton v-for="i in PREVIEW_LIMIT" :key="i" width="100%" height="56px" />
      </Flex>
      <Flex v-else-if="latestItems.length" column gap="xs">
        <HomeForumItem
          v-for="item in latestItems"
          :key="item.id"
          :post="item"
          :mention-lookup="latestMentionLookup"
          expand
        />
      </Flex>
      <p v-else>
        No forum activity.
      </p>
    </HomeDashboardSection>
  </Flex>
</template>
