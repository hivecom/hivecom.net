<script setup lang="ts">
import type { ActivityItem } from '@/composables/useForumActivityFeed'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { Button, Card, Flex, Sheet, Skeleton, Spinner } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import ForumLatestItem from '@/components/Forum/ForumLatestItem.vue'
import { useActivityFeedSheet } from '@/composables/useActivityFeedSheet'
import { useBulkDataUser } from '@/composables/useDataUser'
import { useDiscussionCache } from '@/composables/useDiscussionCache'
import { extractMentionIds } from '@/lib/markdownProcessors'

const props = defineProps<{
  profileId: string
  username?: string | null
}>()

dayjs.extend(relativeTime)

// The generated return type marks all columns non-nullable, but the UNION
// can produce NULLs for title/body/discussion_id depending on item_type.
interface FeedRow {
  id: string
  item_type: string
  discussion_id: string | null
  title: string | null
  body: string | null
  is_nsfw: boolean
  is_offtopic: boolean
  created_at: string
  created_by: string | null
}

const supabase = useSupabaseClient<Database>()
const discussionCache = useDiscussionCache()

// ── Discussion cache warming ───────────────────────────────────────────────
// The RPC doesn't join discussion titles for reply rows - we need to fetch
// them separately and warm the cache so mapRow can resolve titles/slugs.

async function warmDiscussionCache(rows: FeedRow[]) {
  const ids = [
    ...new Set(
      rows
        .filter(r => r.item_type === 'reply' && r.discussion_id != null)
        .map(r => r.discussion_id as string),
    ),
  ]
  if (ids.length === 0)
    return

  const { data } = await supabase.from('discussions').select('*').in('id', ids)
  for (const d of data ?? [])
    discussionCache.set(d as Tables<'discussions'>)
}

// ── Row → ActivityItem mapping ─────────────────────────────────────────────

function mapRow(row: FeedRow): ActivityItem | null {
  if (row.item_type === 'reply') {
    if (row.discussion_id == null || row.body === '#empty')
      return null

    // Warm the discussion cache so ForumLatestItem / Discussion.vue don't re-fetch
    const cached = discussionCache.getById(row.discussion_id)

    return {
      id: row.id,
      type: 'Reply',
      typeLabel: 'Reply in',
      typeContext: cached?.title ?? 'Discussion',
      title: row.body ?? '',
      description: undefined,
      timestamp: dayjs(row.created_at).fromNow(),
      timestampRaw: row.created_at,
      user: row.created_by ?? props.profileId,
      icon: 'ph:chats-circle',
      isNsfw: row.is_nsfw,
      isOfftopic: row.is_offtopic,
      href: `/forum/${cached?.slug ?? row.discussion_id}?comment=${row.id}`,
    }
  }

  if (row.item_type === 'discussion') {
    const cached = row.discussion_id != null ? discussionCache.getById(row.id) : null

    return {
      id: row.id,
      type: 'Discussion',
      typeLabel: 'Created Discussion',
      title: row.title ?? 'Discussion',
      description: row.body ?? undefined,
      timestamp: dayjs(row.created_at).fromNow(),
      timestampRaw: row.created_at,
      user: row.created_by ?? props.profileId,
      icon: 'ph:scroll',
      isNsfw: row.is_nsfw,
      isOfftopic: false,
      href: `/forum/${cached?.slug ?? row.id}`,
    }
  }

  if (row.item_type === 'topic') {
    return {
      id: row.id,
      type: 'Topic',
      typeLabel: 'Created Topic',
      title: row.title ?? 'Topic',
      description: row.body ?? undefined,
      timestamp: dayjs(row.created_at).fromNow(),
      timestampRaw: row.created_at,
      user: row.created_by ?? props.profileId,
      icon: 'ph:folder-open',
      isNsfw: false,
      isOfftopic: false,
      // Topics don't have a direct href - clicking the forum sidebar handles navigation
      href: undefined,
    }
  }

  return null
}

// ── Preview (card, 3 items) ────────────────────────────────────────────────

const previewRaw = ref<FeedRow[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const previewItems = computed<ActivityItem[]>(() => {
  const result: ActivityItem[] = []
  for (const row of previewRaw.value) {
    const item = mapRow(row)
    if (item != null)
      result.push(item)
  }
  return result
})

const hasActivity = computed(() => previewItems.value.length > 0)

async function fetchPreview() {
  loading.value = true
  error.value = null

  const { data, error: rpcError } = await supabase.rpc('get_forum_activity_feed', {
    p_limit: 3,
    p_offset: 0,
    p_created_by: props.profileId,
  })

  if (rpcError != null) {
    error.value = rpcError.message
    loading.value = false
    return
  }

  const rows = (data ?? []) as FeedRow[]
  await warmDiscussionCache(rows)
  previewRaw.value = rows
  loading.value = false
}

onMounted(() => {
  fetchPreview()
})

watch(() => props.profileId, () => {
  fetchPreview()
})

// ── "This week" badge ──────────────────────────────────────────────────────
// Count across all three item types - three targeted HEAD queries, summed.

const activityThisWeek = ref<number | null>(null)

async function fetchThisWeekCount() {
  const weekAgo = dayjs().subtract(7, 'day').toISOString()

  const [repliesRes, discussionsRes, topicsRes] = await Promise.all([
    supabase
      .from('forum_discussion_replies')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', props.profileId)
      .eq('is_deleted', false)
      .eq('is_forum_reply', true)
      .gte('created_at', weekAgo),
    supabase
      .from('discussions')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', props.profileId)
      .eq('is_draft', false)
      .eq('is_archived', false)
      .not('discussion_topic_id', 'is', null)
      .gte('created_at', weekAgo),
    supabase
      .from('discussion_topics')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', props.profileId)
      .eq('is_archived', false)
      .gte('created_at', weekAgo),
  ])

  activityThisWeek.value = (repliesRes.count ?? 0) + (discussionsRes.count ?? 0) + (topicsRes.count ?? 0)
}

onMounted(() => {
  fetchThisWeekCount()
})

watch(() => props.profileId, () => {
  fetchThisWeekCount()
})

// ── Mention lookup for preview ─────────────────────────────────────────────

const previewMentionIds = computed(() =>
  [...new Set(previewRaw.value
    .filter(r => r.item_type === 'reply' && r.body != null)
    .flatMap(r => extractMentionIds(r.body!)),
  )],
)
const { users: previewMentionUsers } = useBulkDataUser(previewMentionIds, { includeAvatar: false })
const previewMentionLookup = computed<Record<string, string>>(() => {
  const lookup: Record<string, string> = {}
  for (const [id, u] of previewMentionUsers.value.entries()) {
    if (u?.username)
      lookup[id] = u.username
  }
  return lookup
})

const emptyStateText = computed(() =>
  `${props.username ?? 'This user'} hasn't posted any forum activity yet.`,
)

// ── Sheet + paginated feed ─────────────────────────────────────────────────

const PAGE_SIZE = 20

async function fetchSheetPage(rows: FeedRow[]): Promise<ActivityItem[]> {
  await warmDiscussionCache(rows)
  const items: ActivityItem[] = []
  for (const row of rows) {
    const item = mapRow(row)
    if (item != null)
      items.push(item)
  }
  return items
}

const {
  sheetOpen,
  sheetItems,
  sheetLoading,
  sheetLoadingMore,
  sheetExhausted,
  sentinel,
  sheetMentionLookup,
  reset: resetSheet,
} = useActivityFeedSheet({
  pageSize: PAGE_SIZE,

  async load() {
    const { data, error: rpcError } = await supabase.rpc('get_forum_activity_feed', {
      p_limit: PAGE_SIZE,
      p_offset: 0,
      p_created_by: props.profileId,
    })
    if (rpcError != null || data == null)
      return []
    return fetchSheetPage(data as FeedRow[])
  },

  async loadMore(offset) {
    const { data, error: rpcError } = await supabase.rpc('get_forum_activity_feed', {
      p_limit: PAGE_SIZE,
      p_offset: offset,
      p_created_by: props.profileId,
    })
    if (rpcError != null || data == null)
      return []
    return fetchSheetPage(data as FeedRow[])
  },
})

const combinedMentionLookup = computed<Record<string, string>>(() => ({
  ...previewMentionLookup.value,
  ...sheetMentionLookup.value,
}))

// Reset sheet when profile changes so the next open fetches fresh data
watch(() => props.profileId, () => {
  resetSheet()
})
</script>

<template>
  <Card separators class="profile-discussions card-bg">
    <template #header>
      <Flex x-between y-center>
        <Flex y-center gap="xs">
          <h4>Forum Activity</h4>
        </Flex>
        <Button v-if="hasActivity && !loading" size="s" plain @click="sheetOpen = true">
          View all
          <template #start>
            <Icon name="ph:chat" />
          </template>
        </Button>
      </Flex>
    </template>

    <!-- Loading State -->
    <Flex v-if="loading" column class="profile-discussions__loading">
      <div v-for="i in 3" :key="`activity-skeleton-${i}`" class="profile-discussions__item profile-discussions__item--skeleton">
        <Flex x-between y-center expand class="mb-xs">
          <Skeleton width="110px" height="11px" />
          <Skeleton width="55px" height="11px" />
        </Flex>
        <Skeleton width="90%" height="13px" />
      </div>
    </Flex>

    <!-- Error State -->
    <Flex v-else-if="error" column y-center x-center class="profile-discussions__empty">
      <Icon name="ph:warning" size="32" class="text-color-light" />
      <p class="text-color-light text-s text-center">
        Failed to load activity.
      </p>
    </Flex>

    <!-- Activity List -->
    <Flex v-else-if="hasActivity" column gap="xxs">
      <ForumLatestItem
        v-for="item in previewItems"
        :key="item.id"
        :post="item"
        :mention-lookup="previewMentionLookup"
        variant="compact"
        expand
        hide-user
      />
    </Flex>

    <!-- Empty State -->
    <Flex v-else column y-center x-center class="profile-discussions__empty">
      <Icon name="ph:chats-circle" size="32" class="text-color-light" />
      <p class="text-color-light text-s text-center">
        {{ emptyStateText }}
      </p>
    </Flex>

    <!-- Sheet -->
    <Sheet :open="sheetOpen" :size="456" @close="sheetOpen = false">
      <template #header>
        <h4 class="pt-xxs">
          Forum activity by {{ props.username ?? 'user' }}
        </h4>
      </template>

      <Flex column gap="m">
        <template v-if="sheetLoading">
          <Skeleton v-for="i in 6" :key="i" width="100%" height="96px" />
        </template>

        <template v-else-if="sheetItems.length === 0">
          <Flex column y-center x-center class="profile-discussions__sheet-empty">
            <Icon name="ph:chats-circle" size="32" class="text-color-light" />
            <p class="text-color-light text-s text-center">
              {{ emptyStateText }}
            </p>
          </Flex>
        </template>

        <template v-else>
          <ForumLatestItem
            v-for="item in sheetItems"
            :key="item.id"
            :post="item"
            :mention-lookup="combinedMentionLookup"
            expand
            hide-user
          />

          <!-- Infinite scroll sentinel -->
          <div ref="sentinel" class="profile-discussions__sentinel">
            <Flex v-if="sheetLoadingMore" expand x-center>
              <Spinner />
            </Flex>
            <span v-else-if="sheetExhausted" class="profile-discussions__exhausted">
              All caught up
            </span>
          </div>
        </template>
      </Flex>
    </Sheet>
  </Card>
</template>

<style lang="scss" scoped>
.profile-discussions {
  overflow: hidden;

  :deep(.vui-card-content) {
    padding: var(--space-xs) !important;
  }

  &__loading {
    padding: 0;
  }

  &__item {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-xs);
    border-radius: var(--border-radius-m);
    cursor: default;
    width: 100%;

    &--skeleton {
      pointer-events: none;
    }
  }

  &__empty {
    min-height: 140px;
    gap: var(--space-m);
    text-align: center;

    p {
      margin: 0;
      max-width: 280px;
    }
  }

  &__sheet-empty {
    min-height: 200px;
    gap: var(--space-m);
    text-align: center;

    p {
      margin: 0;
      max-width: 280px;
    }
  }

  &__sentinel {
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: var(--space-m) 0;
    min-height: 48px;
  }

  &__exhausted {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
  }
}
</style>
