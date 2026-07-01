<script setup lang="ts">
import type { ForumDiscussion, SortColumn, TopicWithDiscussions } from '@/composables/useForumTopics'
import { Badge, Button, Card, Dropdown, DropdownItem, Flex, paginate, Pagination, Popout, PopoutHover, Skeleton, Switch, Tooltip } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { FORUM_KEYS } from '@/components/Forum/Forum.keys'
import ForumBreadcrumbs from '@/components/Forum/ForumBreadcrumbs.vue'
import ForumDiscussionItem from '@/components/Forum/ForumDiscussionItem.vue'
import ForumItemActions from '@/components/Forum/ForumItemActions.vue'
import ForumLatestUpdates from '@/components/Forum/ForumLatestUpdates.vue'
import ForumModalAddDiscussion from '@/components/Forum/ForumModalAddDiscussion.vue'
import ForumModalAddTopic from '@/components/Forum/ForumModalAddTopic.vue'
import ForumRecentlyVisited from '@/components/Forum/ForumRecentlyVisited.vue'
import ForumTopicItem from '@/components/Forum/ForumTopicItem.vue'
import ChartOnlineUsersModal from '@/components/Shared/Charts/ChartOnlineUsersModal.vue'
import ContentRulesModal from '@/components/Shared/ContentRulesModal.vue'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'
import ResponsiveButton from '@/components/Shared/ResponsiveButton.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import { useCache } from '@/composables/useCache'
import { useContentRulesAgreement } from '@/composables/useContentRulesAgreement'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { patchProfileLastSeen, useBulkDataUser, useDataUser } from '@/composables/useDataUser'
import { useDiscoverQueue } from '@/composables/useDiscoverQueue'
import { useEffectiveRole } from '@/composables/useEffectiveRole'
import { useForumActivityFeed } from '@/composables/useForumActivityFeed'
import { useForumDraftCount } from '@/composables/useForumDraftCount'
import { useForumTopics } from '@/composables/useForumTopics'
import { useForumUserActivity } from '@/composables/useForumUserActivity'
import { useRealtimeForumFeed } from '@/composables/useRealtimeForumFeed'
import { useBulkTopicIcons } from '@/composables/useTopicIcon'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'
import { useBreakpoint } from '@/lib/mediaQuery'
import { slugify } from '@/lib/utils/formatting'

dayjs.extend(relativeTime)

const activityModalOpen = ref(false)
const { latestMetrics, fetchLatestMetrics } = useDataMetrics()
fetchLatestMetrics()

useSeoMeta({
  title: 'Forum',
  description: 'Browse and participate in discussions across the Hivecom community forum.',
  ogTitle: 'Forum',
  ogDescription: 'Browse and participate in discussions across the Hivecom community forum.',
})

defineOgImage('Default', {
  title: 'Forum',
  description: 'Browse and participate in discussions across the Hivecom community forum.',
})

const showSettings = ref(false)
const settingsAnchor = useTemplateRef('settings-anchor')

// Top level variable definitions
const userId = useUserId()
const isMobile = useBreakpoint('<s')

const { user } = useDataUser(userId, { includeRole: true })
const { isAdminOrMod } = useEffectiveRole()

// Track which topics/discussions have new content since last visit
const forumUnread = useDataForumUnread()

const addingTopic = ref(false)
const addingDiscussion = ref(false)
const openDraftsDirectly = ref(false)
const rulesModalOpen = ref(false)
const contentRulesGateOpen = ref(false)
const { agreed: agreedContentRules, loading: contentRulesLoading, markAgreed } = useContentRulesAgreement()
const pendingCreateAction = ref<'discussion' | 'topic' | null>(null)

const { settings } = useDataUserSettings()

const supabase = useSupabaseClient()
const forumCache = useCache(CACHE_NAMESPACES.forum)

const ONLINE_THRESHOLD_MS = 15 * 60 * 1000
const ONLINE_USERS_CACHE_KEY = 'online-users'
const ONLINE_USERS_TTL = 60 * 1000 // 1 minute
const onlineUserIds = ref<string[]>([])
const onlineUsersLoading = ref(false)
const onlineCount = computed(() => onlineUserIds.value.length > 0 ? onlineUserIds.value.length : (latestMetrics.value?.users.online ?? null))

async function fetchOnlineUsers() {
  const cached = forumCache.get<string[]>(ONLINE_USERS_CACHE_KEY)
  if (cached) {
    onlineUserIds.value = cached
    return
  }
  onlineUsersLoading.value = true
  const threshold = new Date(Date.now() - ONLINE_THRESHOLD_MS).toISOString()
  const { data } = await supabase
    .from('profiles')
    .select('id, last_seen')
    .gt('last_seen', threshold)
    .order('last_seen', { ascending: false })
    .limit(100)
  const rows = data ?? []
  const ids = rows.map(p => p.id)
  onlineUserIds.value = ids
  forumCache.set(ONLINE_USERS_CACHE_KEY, ids, ONLINE_USERS_TTL)
  for (const row of rows) {
    if (row.last_seen)
      patchProfileLastSeen(row.id, row.last_seen)
  }
  onlineUsersLoading.value = false
}

watch(activityModalOpen, (open) => {
  if (open)
    void fetchOnlineUsers()
})

void fetchOnlineUsers()

watch(contentRulesGateOpen, (open) => {
  if (!open)
    pendingCreateAction.value = null
})

function openDrafts() {
  openDraftsDirectly.value = true
  addingDiscussion.value = true
}

watch(addingDiscussion, (open) => {
  if (!open)
    openDraftsDirectly.value = false
})

async function requestCreate(action: 'discussion' | 'topic') {
  // Wait for the initial fetch to settle before checking
  if (contentRulesLoading.value) {
    await until(contentRulesLoading).toBe(false)
  }

  if (agreedContentRules.value === false) {
    pendingCreateAction.value = action
    contentRulesGateOpen.value = true
    return
  }

  if (action === 'discussion')
    addingDiscussion.value = true
  else
    addingTopic.value = true
}

function handleContentRulesConfirmed() {
  markAgreed()
  contentRulesGateOpen.value = false

  if (pendingCreateAction.value === 'discussion')
    addingDiscussion.value = true
  if (pendingCreateAction.value === 'topic')
    addingTopic.value = true

  pendingCreateAction.value = null
}

function handleContentRulesCanceled() {
  pendingCreateAction.value = null
}

// Topic tree, lazy discussion loading, pagination, sort, active-topic
// navigation and mutations all live in useForumTopics. The page consumes its
// state/actions and keeps the activity-feed wiring, modals and template.
const {
  topics,
  allDiscussions,
  loading,
  activeTopicId,
  activeTopicPath,
  breadcrumbItems,
  modelledTopics,
  topicPagination,
  topicDiscussionsLoading,
  topicPaginationLoading,
  TOPIC_PAGE_SIZE,
  sortColumn,
  sortAscending,
  changeSort,
  getTopicPagination,
  getTopicsByParentId,
  sortDiscussions,
  setActiveTopicById,
  setActiveTopicFromTopic,
  goToTopicPage,
  appendDiscussionToTopic,
  replaceItemData,
  removeItem,
  loadTopics,
  handleBreadcrumbMiddleClick,
} = useForumTopics()

// Bulk-fetch topic icons for all topics so we can show them inline next to titles
const allTopicIds = computed(() => topics.value.map(t => t.id))
const { icons: topicIcons, refresh: refreshTopicIcon } = useBulkTopicIcons(allTopicIds)

// Pathing and topic nesting
const route = useRoute()
const router = useRouter()

// Only refetch activity when navigating back to the mainpage. Navigating
// between topics/discussions triggers the skeleton loading all the time causing
// annoying visual feedback
// Lookup map from topic id → topic name, used by the personal activity feed
const topicLookup = computed(() => {
  const map = new Map<string, string>()
  for (const topic of topics.value)
    map.set(topic.id, topic.name)
  return map
})

// Provide topics and activeTopicId to child modals
provide(FORUM_KEYS.forumTopics, () => topics)
provide(FORUM_KEYS.forumActiveTopicId, () => activeTopicId)
provide(FORUM_KEYS.forumRefreshTopicIcon, refreshTopicIcon)

// ── Derived visibility sets used by activity feed ──────────────────────────
const visibleDiscussionIds = computed(() => {
  const archivedTopicIds = new Set(
    topics.value.filter(t => t.is_archived).map(t => t.id),
  )
  return new Set(
    allDiscussions.value
      .filter((d) => {
        if (!settings.value.show_forum_archived) {
          if (d.is_archived)
            return false
          if (d.discussion_topic_id != null && archivedTopicIds.has(d.discussion_topic_id))
            return false
        }
        if (!settings.value.show_nsfw_content && d.is_nsfw)
          return false
        return true
      })
      .map(d => d.id),
  )
})

const discussionLookup = computed(() => {
  const lookup = new Map<string, ForumDiscussion>()
  // Seed from the global index first
  allDiscussions.value.forEach(d => lookup.set(d.id, d))
  // Overwrite with lazily-loaded per-topic data which may have fresher counts
  topics.value.forEach((topic) => {
    topic.discussions.forEach((discussion) => {
      lookup.set(discussion.id, discussion)
    })
  })
  return lookup
})

const hiddenTopicIds = computed(() => {
  if (settings.value.show_forum_archived)
    return new Set<string>()
  return new Set(
    topics.value
      .filter(topic => topic.is_archived)
      .map(topic => topic.id),
  )
})

// ── Composables ────────────────────────────────────────────────────────────

const {
  userActivityLoading,
  visibleUserActivity,
  fetchUserActivity,
} = useForumUserActivity({
  userId,
  settings,
  discussionLookup,
})

watch(() => route.fullPath, () => fetchUserActivity(userId.value))

// Capture the timestamp from the *previous* visit before we update it.
// recordFeedVisit() reads the stored value, updates it to now, and returns the old one.
const lastFeedVisitedAt = ref<string | null>(null)

const feedOptions = computed(() => ({
  settings,
  discussionLookup,
  visibleDiscussionIds,
  hiddenTopicIds,
  onTopicClick: (id: string) => setActiveTopicById(id),
}))

const {
  latestPosts,
  latestPostMentionIds,
  latestPostAuthorIds,
  postSinceYesterday,
  postsSinceLastVisit,
  fetchLatestReplies,
  fetchTodayCount,
  fetchSinceLastVisitCount,
  bumpSinceLastVisitCount,
  prependReplyItem,
  prependDiscussionItem,
} = useForumActivityFeed({
  topics,
  allDiscussions,
  settings,
  discussionLookup,
  visibleDiscussionIds,
  hiddenTopicIds,
  onTopicClick: (id: string) => setActiveTopicById(id),
})

const FEED_STALE_MS = 15 * 60 * 1000 // 15 minutes
let hiddenAt: number | null = null

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now()
  }
  else if (document.visibilityState === 'visible') {
    if (hiddenAt != null && Date.now() - hiddenAt >= FEED_STALE_MS) {
      void Promise.all([
        fetchLatestReplies(),
        fetchTodayCount(),
        fetchSinceLastVisitCount(lastFeedVisitedAt.value),
      ])
    }
    hiddenAt = null
  }
}

onMounted(() => {
  lastFeedVisitedAt.value = forumUnread.recordFeedVisit()
  // Server-side count for the "since last visit" badge so it isn't capped by
  // the carousel slice (16) or the latest-replies fetch (30).
  void fetchSinceLastVisitCount(lastFeedVisitedAt.value)
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
// ── Realtime feed updates ─────────────────────────────────────────────────

// Count of incoming items not yet reflected in the paginated sheet feed.
// Reset when the sheet reloads. The carousel updates immediately.
const feedPendingCount = ref(0)

function handleTopicActivity(topicId: string, lastActivityAt: string) {
  const idx = topics.value.findIndex(t => t.id === topicId)
  if (idx !== -1) {
    const current = topics.value[idx]
    topics.value[idx] = Object.assign({}, current, { last_activity_at: lastActivityAt }) as TopicWithDiscussions
  }
}

const { subscribe: subscribeForumFeed } = useRealtimeForumFeed({
  onReply: (item) => {
    prependReplyItem(item)
    // Bump the "since last visit" badge if the item is newer than the
    // watermark and not authored by the current user.
    if (lastFeedVisitedAt.value != null
      && new Date(item.timestampRaw).getTime() > new Date(lastFeedVisitedAt.value).getTime()
      && item.user !== userId.value) {
      bumpSinceLastVisitCount(1)
    }
  },
  onDiscussion: (item) => {
    prependDiscussionItem(item)
    if (lastFeedVisitedAt.value != null
      && new Date(item.timestampRaw).getTime() > new Date(lastFeedVisitedAt.value).getTime()
      && item.user !== userId.value) {
      bumpSinceLastVisitCount(1)
    }
  },
  onPendingSheet: (delta) => { feedPendingCount.value += delta },
  onTopicActivity: handleTopicActivity,
  discussionLookup,
  settings,
  visibleDiscussionIds,
  hiddenTopicIds,
})

const { draftCount, fetchDraftCount, handleDraftUpdated } = useForumDraftCount(userId)

// ── Mention lookup for activity feed ──────────────────────────────────────
const { users: mentionUsers } = useBulkDataUser(latestPostMentionIds, {
  includeAvatar: false,
  includeRole: false,
})

// Pre-warm the role cache for all post authors so UserDisplay components
// don't each fire their own user_roles query.
useBulkDataUser(latestPostAuthorIds, {
  includeAvatar: true,
  includeRole: true,
})

const mentionLookup = computed<Record<string, string>>(() => {
  const lookup: Record<string, string> = {}
  for (const [id, u] of mentionUsers.value.entries()) {
    if (u?.username)
      lookup[id] = u.username
  }
  return lookup
})

onBeforeMount(async () => {
  // Topics + discussion index (owns the `loading` flag and active-topic resolution).
  await loadTopics()

  // Activity feed is page-owned; fetch it after topics so the lookups it needs
  // are populated.
  await Promise.all([fetchLatestReplies(), fetchTodayCount()])

  // Start realtime subscription after initial data is loaded so that the
  // discussionLookup and visibleDiscussionIds are populated for filtering.
  subscribeForumFeed()
})

// Search implementation
const { openCommand } = useCommand()

// Allow external navigation (e.g. command palette) to open the create discussion modal
// by passing ?new=discussion in the URL. Clean up the param immediately after.
// Watched rather than onMounted so it also fires when already on the page.
watch(
  () => route.query.new,
  async (val) => {
    if (val === 'discussion') {
      await router.replace({ query: { ...route.query, new: undefined } })
      await requestCreate('discussion')
    }
  },
  { immediate: true },
)

function sortIcon(col: SortColumn) {
  if (sortColumn.value !== col)
    return null
  return sortAscending.value ? 'ph:arrow-up' : 'ph:arrow-down'
}

// Auto-scroll to the top of the page whenever nested topic is changed
watch(activeTopicId, () => {
  window.scrollTo(0, 0)
})

const { navigate: navigateToRandomDiscussion } = useDiscoverQueue()

onBeforeMount(() => {
  fetchDraftCount()
})
</script>

<template>
  <div class="page forum container-l">
    <ClientOnly>
      <section class="page-title mb-m">
        <Flex expand x-between y-center>
          <div>
            <h1>
              Forum
            </h1>
            <p>
              Bringing back the old school internet experience
            </p>
          </div>
          <PopoutHover v-if="onlineCount" :disabled="onlineCount <= 0" placement="bottom-end">
            <template #trigger>
              <OnlineBadge :count="onlineCount" clickable @click="activityModalOpen = true" />
            </template>
            <Flex column gap="xs" class="px-m py-s">
              <UserDisplay
                v-for="id in onlineUserIds"
                :key="id"
                :user-id="id"
                size="s"
                linked
                show-preview
                show-online-indicator
              />
            </Flex>
          </PopoutHover>
        </Flex>
      </section>

      <ForumRecentlyVisited
        v-if="settings.show_forum_recently_visited && userId && (userActivityLoading || visibleUserActivity.length > 0)"
        :loading="userActivityLoading"
        :items="visibleUserActivity"
        :topic-lookup="topicLookup"
      />

      <ForumLatestUpdates
        v-if="settings.show_forum_updates"
        :loading="loading"
        :latest-posts="latestPosts"
        :post-since-yesterday="postSinceYesterday"
        :posts-since-last-visit="postsSinceLastVisit"
        :last-visited-at="lastFeedVisitedAt"
        :mention-lookup="mentionLookup"
        :feed-options="feedOptions"
        :feed-pending-count="feedPendingCount"
        @feed-reloaded="feedPendingCount = 0"
      />

      <Flex x-start y-center class="mb-m" :gap="isMobile ? 'xxs' : 'xs'">
        <Button :disabled="!activeTopicId" size="s" :square="!isMobile" outline @click="(e: MouseEvent) => { if (e.button === 1) { e.preventDefault(); return } setActiveTopicById(activeTopicPath.at(-2)?.parent_id ?? null) }">
          <template v-if="isMobile" #start>
            <Icon :name="!activeTopicId ? 'ph:house' : 'ph:arrow-left'" />
          </template>
          <Icon v-if="!isMobile" :name="!activeTopicId ? 'ph:house' : 'ph:arrow-left'" />
          <template v-if="isMobile">
            {{ !activeTopicId ? 'Forum' : "Back" }}
          </template>
        </Button>
        <ForumBreadcrumbs
          v-if="!isMobile"
          :items="breadcrumbItems"
          :icons="topicIcons"
          :on-root-click="() => setActiveTopicById(null)"
          :on-root-middle-click="() => handleBreadcrumbMiddleClick()"
        />

        <div class="flex-1" />

        <!-- Only allow creating things for signed in users -->
        <Flex :gap="isMobile ? 'xxs' : 'xs'">
          <template v-if="user">
            <Button
              v-if="user && draftCount > 0"
              size="s"
              variant="link"
              :square="isMobile"
              @click="openDrafts"
            >
              <template v-if="!isMobile" #start>
                <Icon name="ph:note-pencil" :size="16" />
              </template>
              <template v-if="isMobile">
                <Icon name="ph:note-pencil" :size="16" />
              </template>
              {{ isMobile ? draftCount : `${draftCount} Draft${draftCount > 1 ? 's' : ''}` }}
            </Button>

            <Dropdown v-if="isAdminOrMod">
              <template #trigger="{ toggle }">
                <ResponsiveButton size="s" variant="accent" icon="ph:plus" label="Create" @click="toggle" />
              </template>
              <DropdownItem size="s" @click="requestCreate('discussion')">
                Discussion
                <template v-if="draftCount > 0" #hint>
                  <Badge size="s">
                    {{ draftCount }} Draft{{ draftCount > 1 ? 's' : '' }}
                  </Badge>
                </template>
              </DropdownItem>
              <DropdownItem size="s" @click="requestCreate('topic')">
                Topic
              </DropdownItem>
            </Dropdown>

            <!-- Non-admin or moderators can only create a discussion -->
            <ResponsiveButton v-else size="s" variant="accent" icon="ph:plus" label="Discussion" @click="requestCreate('discussion')" />
          </template>
          <template v-else>
            <Tooltip placement="top">
              <template #tooltip>
                <p>Sign-in to start a discussion</p>
              </template>
              <ResponsiveButton size="s" variant="gray" icon="ph:plus" label="Create" disabled />
            </Tooltip>
          </template>

          <ResponsiveButton size="s" icon="ph:magnifying-glass" label="Search" @click="openCommand(['discussion_topic', 'discussion'])" />

          <ResponsiveButton size="s" icon="ph:book" label="Rules" @click="rulesModalOpen = true" />
          <ContentRulesModal v-model:open="rulesModalOpen" :show-agree-button="false" />
          <ContentRulesModal
            v-model:open="contentRulesGateOpen"
            :show-agree-button="true"
            @confirm="handleContentRulesConfirmed"
            @cancel="handleContentRulesCanceled"
          />

          <ResponsiveButton size="s" icon="ph:shuffle" label="Discover" @click="navigateToRandomDiscussion" />

          <Button ref="settings-anchor" size="s" square @click="showSettings = !showSettings">
            <Icon name="ph:gear" />
          </Button>

          <Popout :visible="showSettings" :anchor="settingsAnchor" placement="bottom" @click-outside="showSettings = false">
            <Flex column class="p-m" gap="s" expand>
              <Flex x-between y-center expand>
                <span class="text-m mb-xs text-color-light">Display options</span>
                <NuxtLink to="/profile/settings">
                  <Button size="s">
                    Settings
                    <template #end>
                      <Icon name="ph:arrow-square-out" />
                    </template>
                  </Button>
                </NuxtLink>
              </Flex>
              <Switch v-model="settings.show_forum_updates" label="Show latest activity" />
              <Switch v-model="settings.show_forum_recently_visited" label="Show recently visited" />
              <Switch v-model="settings.show_forum_archived" label="Show archived topics & discussions" />
              <Switch v-model="settings.show_forum_unread_bubbles" label="Show unread bubbles" />
              <!-- <Switch v-model="settings.showNsfw" label="Show NSFW in latest activity" /> -->
            </Flex>
          </Popout>
        </Flex>
      </Flex>

      <Card v-if="loading" class="forum__category" separators>
        <div class="forum__category-title">
          <Skeleton width="175px" height="32px" />
          <div />
          <!-- <Skeleton width="124px" height="24px" /> -->
          <Skeleton width="128px" height="16px" />
          <Skeleton width="57px" height="16px" />
          <Skeleton width="49px" height="16px" style="margin-left:auto;margin-right:auto;" />
        </div>

        <ul>
          <li v-for="item in 6" :key="item" class="forum__category-post" style="height:71.3px">
            <div class="forum__category-post--item">
              <Skeleton width="40px" height="40px" />

              <Flex column :gap="0" class="forum__category-post--name">
                <Skeleton width="128px" height="16px" class="mb-xs" />
                <Skeleton width="192px" height="16px" />
              </Flex>
              <div v-for="skel of 3" :key="skel" class="forum__category-post--meta">
                <Skeleton width="32px" height="16px" />
              </div>
            </div>
          </li>
        </ul>
      </Card>
      <template v-else>
        <Card v-for="(topic, index) in modelledTopics" :key="topic.id" class="forum__category" separators>
          <div class="forum__category-title">
            <Flex y-center>
              <NuxtLink
                :id="slugify(topic.name)"
                class="forum__category-title-button"
                :to="`/forum?${topic.slug ? `activeTopic=${topic.slug}` : `activeTopicId=${topic.id}`}`"
                @click.prevent="setActiveTopicFromTopic(topic)"
              >
                <img
                  v-if="topicIcons.get(topic.id)"
                  :src="topicIcons.get(topic.id)!"
                  :alt="`${topic.name} icon`"
                  class="forum__category-title-icon"
                >
                {{ topic.name }}
              </NuxtLink>
              <Badge v-if="topic.is_locked">
                <Icon name="ph:lock" />

                Locked
              </Badge>

              <Badge v-if="topic.is_archived" variant="warning">
                <Icon name="ph:archive" class="text-color-yellow" />

                Archived
              </Badge>
            </Flex>
            <template v-if="index === 0">
              <div class="forum__sort-wrapper">
                <div>
                  <Button plain size="s" class="forum__sort-header" :class="{ active: sortColumn === 'reply_count' }" :disabled="isMobile" @click="changeSort('reply_count')">
                    Discussions / Replies
                    <template v-if="!isMobile && sortIcon('reply_count')" #end>
                      <Icon :name="sortIcon('reply_count')!" />
                    </template>
                  </Button>
                </div>
              </div>
              <div class="forum__sort-wrapper">
                <div>
                  <Button plain size="s" class="forum__sort-header" :class="{ active: sortColumn === 'view_count' }" :disabled="isMobile" @click="changeSort('view_count')">
                    Views
                    <template v-if="!isMobile && sortIcon('view_count')" #end>
                      <Icon :name="sortIcon('view_count')!" />
                    </template>
                  </Button>
                </div>
              </div>
              <div class="forum__sort-wrapper">
                <div>
                  <Button plain size="s" class="forum__sort-header" :class="{ active: sortColumn === 'last_activity_at' }" :disabled="isMobile" @click="changeSort('last_activity_at')">
                    Last activity
                    <template v-if="!isMobile && sortIcon('last_activity_at')" #end>
                      <Icon :name="sortIcon('last_activity_at')!" />
                    </template>
                  </Button>
                </div>
              </div>
            </template>
            <template v-else>
              <div />
              <div />
              <div />
            </template>
            <ForumItemActions table="discussion_topics" :data="topic" @update="replaceItemData('topic', $event)" @remove="removeItem('topic', $event)" />
          </div>

          <ul v-if="topicDiscussionsLoading.has(topic.id) || sortDiscussions(topic.discussions).length > 0 || sortDiscussions(topic.stickyDiscussions).length > 0 || (!(activeTopicId && topic.id === activeTopicId) && getTopicsByParentId(topic.id).length > 0)">
            <template v-if="topicDiscussionsLoading.has(topic.id)">
              <li v-for="n in Math.min(5, topicPagination[topic.id]?.totalCount || 5)" :key="n" class="forum__category-post">
                <div class="forum__category-post--item">
                  <Skeleton width="40px" height="40px" />
                  <Flex column :gap="0" class="forum__category-post--name">
                    <Skeleton width="200px" height="16px" class="mb-xs" />
                    <Skeleton width="280px" height="16px" />
                  </Flex>
                </div>
              </li>
            </template>
            <ForumTopicItem
              v-for="subtopic of (topic.id === activeTopicId ? [] : getTopicsByParentId(topic.id))"
              :key="subtopic.id"
              :data="subtopic"
              :href="`/forum?${subtopic.slug ? `activeTopic=${subtopic.slug}` : `activeTopicId=${subtopic.id}`}`"
              :last-activity="subtopic.last_activity_at"
              :discussion-count="subtopic.total_discussion_count"
              :reply-count="subtopic.total_reply_count"
              :view-count="subtopic.total_view_count"
              :has-new="settings.show_forum_unread_bubbles && forumUnread.isTopicNewWithDiscussions(subtopic.id, subtopic.last_activity_at, [...(subtopic.stickyDiscussions ?? []), ...(subtopic.discussions ?? [])], subtopic.discussionsLoaded, (subtopic as any).last_activity_by /* TODO: regenerate types after migration */)"
              @click="setActiveTopicFromTopic(subtopic)"
              @update="replaceItemData('topic', $event)"
              @remove="removeItem('topic', $event)"
            />

            <ForumDiscussionItem
              v-for="discussion of sortDiscussions(topic.stickyDiscussions)"
              :key="discussion.id"
              :class="{ 'forum__category-post--dimmed': topicPaginationLoading.has(topic.id) }"
              :data="discussion"
              :last-activity="discussion.last_activity_at"
              :has-new="settings.show_forum_unread_bubbles && forumUnread.isDiscussionNew(discussion.id, discussion.reply_count, (discussion as any).last_activity_by /* TODO: regenerate types after migration */)"
              @click="forumUnread.markDiscussionSeen(discussion.id, discussion.reply_count ?? 0)"
              @update="replaceItemData('discussion', $event)"
              @remove="removeItem('discussion', $event)"
            />
            <ForumDiscussionItem
              v-for="discussion of sortDiscussions(topic.discussions)"
              :key="discussion.id"
              :class="{ 'forum__category-post--dimmed': topicPaginationLoading.has(topic.id) }"
              :data="discussion"
              :last-activity="discussion.last_activity_at"
              :has-new="settings.show_forum_unread_bubbles && forumUnread.isDiscussionNew(discussion.id, discussion.reply_count, (discussion as any).last_activity_by /* TODO: regenerate types after migration */)"
              @click="forumUnread.markDiscussionSeen(discussion.id, discussion.reply_count ?? 0)"
              @update="replaceItemData('discussion', $event)"
              @remove="removeItem('discussion', $event)"
            />
          </ul>
          <div
            v-if="topic.discussionsLoaded && getTopicPagination(topic.id) && getTopicPagination(topic.id)!.totalCount > TOPIC_PAGE_SIZE"
            class="forum__category-pagination"
            :class="{ 'forum__category-pagination--dimmed': topicPaginationLoading.has(topic.id) }"
          >
            <Pagination
              :disabled="topicPaginationLoading.has(topic.id)"
              :pagination="paginate(getTopicPagination(topic.id)!.totalCount, getTopicPagination(topic.id)!.page + 1, TOPIC_PAGE_SIZE)"
              @change="(p) => goToTopicPage(topic.id, p - 1)"
            />
          </div>
          <div
            v-if="topic.discussionsLoaded && sortDiscussions(topic.discussions).length === 0 && sortDiscussions(topic.stickyDiscussions).length === 0 && getTopicsByParentId(topic.id).length === 0"
            class="forum__category-empty"
          >
            <Flex x-between y-center expand>
              <template v-if="!settings.show_forum_archived && [...topic.discussions, ...topic.stickyDiscussions].filter((d) => d.is_archived).length > 0">
                <p>No active discussions - {{ [...topic.discussions, ...topic.stickyDiscussions].filter((d) => d.is_archived).length }} archived {{ [...topic.discussions, ...topic.stickyDiscussions].filter((d) => d.is_archived).length === 1 ? 'discussion' : 'discussions' }} hidden.</p>
                <Button size="s" variant="gray" @click="settings.show_forum_archived = true">
                  Show archived
                </Button>
              </template>
              <template v-else>
                <Flex :column="isMobile" :x-between="!isMobile" y-center expand class="empty-state-wrap">
                  <p class="text-s empty-state-text">
                    There are no discussions in this topic{{ topic.is_archived ? '' : ' - start one!' }}
                  </p>
                  <Button v-if="!topic.is_archived && !topic.is_locked && user" size="s" variant="accent" class="empty-state-btn" @click="requestCreate('discussion')">
                    Create discussion
                  </Button>
                </Flex>
              </template>
            </Flex>
          </div>
        </Card>
      </template>

      <ForumModalAddTopic
        :open="addingTopic"
        @close="addingTopic = false"
        @created="(topic) => topics.push(topic)"
      />

      <ForumModalAddDiscussion
        :open="addingDiscussion"
        :start-on-drafts="openDraftsDirectly"
        @close="addingDiscussion = false; openDraftsDirectly = false"
        @created="appendDiscussionToTopic"
        @draft-updated="handleDraftUpdated()"
      />

      <Flex expand x-end>
        <NuxtLink to="/forum/stats">
          <Button plain size="s" square>
            <Icon name="ph:ranking" class="text-color-lightest" />
          </Button>
        </NuxtLink>
      </Flex>

      <ChartOnlineUsersModal
        v-model:open="activityModalOpen"
        :online-user-ids="onlineUserIds"
        :online-users-loading="onlineUsersLoading"
        :online-count="onlineCount"
      />
    </ClientOnly>
  </div>
</template>

<style lang="scss">
@use '@/assets/mixins.scss' as *;

:root.light .forum__category-post.pinned .forum__category-post--icon {
  background-color: color-mix(in srgb, var(--color-accent) 20%, transparent) !important;
}

.forum {
  h5 {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-light);
  }

  &__category {
    background-color: var(--color-bg-medium);

    h3 {
      height: 28px;
      line-height: 28px;
      font-size: var(--font-size-xl);
    }

    .forum__category-title-button {
      font-weight: var(--font-weight-bold);
      line-height: 1.7em;
      cursor: pointer;
    }

    &:has(.forum__category-title .has-active-dropdown),
    &:hover {
      .forum__category-title .forum__item-actions {
        display: block;
      }
    }

    &:not(:last-of-type) {
      margin-bottom: var(--space-xl);
    }

    .vui-card-content {
      padding: 0 !important;
    }
  }

  &__category-title-icon {
    width: 24px;
    height: 24px;
    border-radius: var(--border-radius-s);
    object-fit: cover;
    flex-shrink: 0;
    vertical-align: middle;
    margin-left: var(--space-xs);
    margin-right: var(--space-xs);
  }

  &__category-title,
  &__category-post .forum__category-post--item {
    display: grid;
    grid-template-columns: 40px 5fr 172px 64px 128px 24px;
    align-items: center;
    gap: var(--space-s);
    padding: var(--space-s) var(--space-m);
  }

  &__category-title {
    padding-block: var(--space-s);
    align-items: center;
    border-bottom: 1px solid var(--color-border);

    & > .vui-flex {
      grid-column: 1 / 3;
    }

    span {
      font-size: var(--font-size-s);
      color: var(--color-text-light);
      text-align: center;
    }

    .forum__sort-header {
      font-size: var(--font-size-s);
      color: var(--color-text-light);

      &:hover {
        color: var(--color-text);
      }

      @media screen and (max-width: $breakpoint-s) {
        padding: 0;
      }
    }

    .forum__sort-wrapper {
      width: 100%;
      display: flex;
      justify-content: center;
    }
  }

  &__category-pagination {
    padding: var(--space-s) var(--space-m);
    display: flex;
    justify-content: center;
    transition: opacity var(--transition);

    &--dimmed {
      opacity: 0.4;
      pointer-events: none;
    }
  }

  &__category-post {
    transition: opacity var(--transition);

    &--dimmed {
      opacity: 0.4;
      pointer-events: none;
    }

    &:has(.has-active-dropdown),
    &:hover {
      .forum__item-actions {
        display: block;
      }
    }

    &.pinned {
      .forum__category-post--icon {
        background-color: color-mix(in srgb, var(--color-accent) 5%, transparent);
        border-color: var(--color-bg-accent-lowered);
      }
    }

    &:not(:last-child) {
      border-bottom: 1px solid var(--color-border);
    }

    &:last-child .forum__category-post--item {
      border-bottom-right-radius: var(--border-radius-m);
      border-bottom-left-radius: var(--border-radius-m);
    }

    .forum__category-post--item {
      background-color: var(--color-bg-card);
      text-decoration: none;
      cursor: pointer;

      &:hover {
        background-color: var(--color-bg-raised);
      }

      &--name {
        strong {
          display: flex;
          gap: 4px;
          align-items: center;
        }
      }

      p {
        @include line-clamp(1);
      }
    }

    .forum__category-post--meta {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-xxs);
    }

    .forum__category-post--meta span {
      font-size: var(--font-size-s);
      color: var(--color-text-light);
      text-align: center;
      white-space: nowrap;
    }
  }

  &__category-post--icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--border-radius-l);
    border: 1px solid var(--color-border);
    position: relative;

    .iconify {
      color: var(--color-accent);
    }

    &.has-new:after {
      content: '';
      position: absolute;
      bottom: -3px;
      right: -3px;
      width: 8px;
      height: 8px;
      border-radius: var(--border-radius-pill);
      background: var(--color-accent);
      border: 2px solid var(--color-bg);
    }
  }

  &__category-post--name {
    strong {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    p {
      color: var(--color-text-lighter);
      font-size: var(--font-size-s);
    }
  }

  &__category-pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xxs);
    padding: var(--space-s) var(--space-m);
    border-top: 1px solid var(--color-border);
  }

  &__category-empty {
    padding: var(--space-s) var(--space-m);
    font-size: var(--font-size-m);
    color: var(--color-text-light);
  }

  &__item-actions {
    display: none;
  }
}

@media screen and (max-width: $breakpoint-s) {
  .forum__category-title,
  .forum__category-post .forum__category-post--item {
    grid-template-columns: 40px 5fr 1fr 24px;
  }

  .forum__category-title > span,
  .forum__category-title > .forum__sort-header,
  .forum__category-title > div {
    white-space: nowrap;
    font-size: var(--font-size-xs);
    padding: 0;

    &:nth-child(2),
    &:nth-child(3) {
      display: none;
    }
  }

  .forum__category-post .forum__category-post--item .forum__category-post--meta {
    span {
      font-size: var(--font-size-xs);
    }

    &:nth-child(3),
    &:nth-child(4) {
      display: none;
    }
  }

  .forum__item-actions {
    display: block;
  }
}

@media screen and (max-width: $breakpoint-s) {
  .forum__category-title,
  .forum__category-post .forum__category-post--item {
    grid-template-columns: 32px 5fr 1fr 24px;
    gap: var(--space-m);
  }

  .forum__category-post--icon {
    width: 32px;
    height: 32px;
    border-radius: var(--border-radius-l);
    align-self: start;

    .iconify {
      font-size: 16px !important;
    }
  }

  .forum__category-post--name strong {
    font-size: var(--font-size-s);
  }

  .forum__category-post--name p {
    font-size: var(--font-size-xs);
  }

  .forum__category-post .forum__category-post--item .forum__category-post--meta span {
    font-size: var(--font-size-xxs);
  }

  .empty-state-btn {
    width: 100%;
  }

  .empty-state-text {
    width: 100%;
    font-size: var(--font-size-xs);
    text-align: center;
  }
}
</style>
