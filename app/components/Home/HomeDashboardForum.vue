<script setup lang="ts">
import type { SubscriptionRow } from '@/composables/useDiscussionSubscriptionsCache'
import type { Database } from '@/types/database.types'
import { Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import { useDataNotifications } from '@/composables/useDataNotifications'
import { useUserId } from '@/composables/useUserId'

dayjs.extend(relativeTime)

// Raw data pass for the Forum card, priority order from the sketch: activity
// aimed at me first (replies, mentions), then my subscriptions, then the
// general feed as filler when the personal buckets are empty.

type FeedRow = Database['public']['Functions']['get_forum_activity_feed']['Returns'][number]

const supabase = useSupabaseClient<Database>()
const userId = useUserId()
const { discussionNotifications, replyNotifications, mentionNotifications } = useDataNotifications()

// Unread notifications about my posts, newest first.
const myActivity = computed(() =>
  [...discussionNotifications.value, ...replyNotifications.value, ...mentionNotifications.value]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5),
)

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

// Latest activity across the whole forum, raw from the feed RPC.
const feed = ref<FeedRow[]>([])

onMounted(async () => {
  const { data } = await supabase.rpc('get_forum_activity_feed', { p_limit: 5 })
  feed.value = data ?? []
})

function excerpt(text: string | null): string {
  if (text == null || text === '')
    return ''
  return text.length > 80 ? `${text.slice(0, 80)}...` : text
}
</script>

<template>
  <Flex column gap="m">
    <HomeDashboardSection label="Activity on your posts">
      <ul v-if="myActivity.length">
        <li v-for="n in myActivity" :key="n.id">
          <NuxtLink v-if="n.href" :to="n.href">
            [{{ n.source }}] {{ n.title }}
          </NuxtLink>
          <span v-else>[{{ n.source }}] {{ n.title }}</span>
          - {{ dayjs(n.created_at).fromNow() }}
        </li>
      </ul>
      <p v-else>
        Nothing new on your posts.
      </p>
    </HomeDashboardSection>

    <HomeDashboardSection label="Your subscriptions">
      <div v-if="subscriptions.length">
        <NuxtLink v-for="sub in subscriptions" :key="sub.id" :to="`/forum/${sub.discussion?.slug ?? sub.discussion_id}`">
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
      <ul v-if="feed.length">
        <li v-for="item in feed" :key="item.id">
          [{{ item.item_type }}] {{ excerpt(item.title ?? item.body) }}
          <UserDisplay v-if="item.created_by" :user-id="item.created_by" size="s" inline />
          - {{ dayjs(item.created_at).fromNow() }}
        </li>
      </ul>
      <p v-else>
        No forum activity.
      </p>
    </HomeDashboardSection>
  </Flex>
</template>
