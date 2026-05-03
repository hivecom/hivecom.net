<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Button, Card, Dropdown, DropdownItem, Flex, paginate, Pagination, Popout, Skeleton, Switch, Tooltip } from '@dolanske/vui'
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
import ContentRulesModal from '@/components/Shared/ContentRulesModal.vue'
import SharedTinyBadge from '@/components/Shared/TinyBadge.vue'
import { useCache } from '@/composables/useCache'
import { useContentRulesAgreement } from '@/composables/useContentRulesAgreement'
import { useBulkDataUser, useDataUser } from '@/composables/useDataUser'
import { useDiscoverQueue } from '@/composables/useDiscoverQueue'
import { useForumActivityFeed } from '@/composables/useForumActivityFeed'
import { useForumDraftCount } from '@/composables/useForumDraftCount'
import { useForumUserActivity } from '@/composables/useForumUserActivity'
import { useRealtimeForumFeed } from '@/composables/useRealtimeForumFeed'
import { useBulkTopicIcons } from '@/composables/useTopicIcon'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'
import { useBreakpoint } from '@/lib/mediaQuery'
import { composePathToTopic } from '@/lib/topics'
import { slugify } from '@/lib/utils/formatting'

dayjs.extend(relativeTime)

const FORUM_TOPICS_CACHE_KEY = 'topics-v3'
const FORUM_TOPICS_TTL = 5 * 60 * 1000 // 5 minutes

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

type ForumDiscussion = Tables<'discussions'>

export type TopicWithDiscussions = Tables<'discussion_topics'> & {
  discussions: ForumDiscussion[]
  stickyDiscussions: ForumDiscussion[]
  discussionsLoaded: boolean
}

// Show display settings & store them in localStorage
type SortColumn = 'last_activity_at' | 'reply_count' | 'view_count'

const sortColumn = ref<SortColumn>('last_activity_at')
const sortAscending = ref(false)

const showSettings = ref(false)
const settingsAnchor = useTemplateRef('settings-anchor')

// Top level variable definitions
const userId = useUserId()
const isMobile = useBreakpoint('<s')

const { user } = useDataUser(userId, { includeRole: true })

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

const loading = ref(false)
const supabase = useSupabaseClient()
const forumCache = useCache(CACHE_NAMESPACES.forum)

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

const topicsError = ref<string | null>(null)
const topics = ref<TopicWithDiscussions[]>([])

// Lightweight discussion index for the activity feed, visibleDiscussionIds,
// and discussionLookup. Fetched once on mount independently of the lazy
// per-topic discussion loads so the feed works without clicking into topics.
const FORUM_DISCUSSIONS_INDEX_CACHE_KEY = 'discussions-index:v1'
const FORUM_DISCUSSIONS_INDEX_TTL = 5 * 60 * 1000

// Per-topic discussion page cache
const TOPIC_DISCUSSIONS_TTL = 3 * 60 * 1000 // 3 minutes
function topicDiscussionsCacheKey(topicId: string, page: number, sort: SortColumn, asc: boolean): string {
  return `topic-discussions:${topicId}:${page}:${sort}:${asc ? 'asc' : 'desc'}`
}

interface TopicDiscussionsPage {
  discussions: ForumDiscussion[]
  stickyDiscussions: ForumDiscussion[]
  totalCount: number | null
}
const allDiscussions = ref<ForumDiscussion[]>([])

const TOPIC_PAGE_SIZE = 15

interface TopicPaginationState {
  page: number
  totalCount: number
}
// Keyed by topicId
const topicPagination = ref<Record<string, TopicPaginationState>>({})

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

// Pathing and topic nesting
const activeTopicId = ref<string | null>(null)

// Read initial query values once on mount – we drive URL updates manually via
// router.push / router.replace so we can control whether each change adds a
// history entry or not.
const activeTopicSlug = computed({
  get: () => (route.query.activeTopic as string | null) ?? null,
  set: (value: string | null) => {
    // setter is intentionally a no-op; callers use _setQuery directly
    void value
  },
})
const activeTopicIdQuery = computed({
  get: () => (route.query.activeTopicId as string | null) ?? null,
  set: (value: string | null) => {
    void value
  },
})

/**
 * Update the URL query params for the active topic.
 * @param slug  The slug to set in ?activeTopic, or null to clear.
 * @param uuid  The UUID to set in ?activeTopicId, or null to clear.
 * @param push  When true uses router.push (adds history entry), otherwise replace.
 */
function _setQuery(slug: string | null, uuid: string | null, push: boolean) {
  const query: Record<string, string> = {}
  if (slug)
    query.activeTopic = slug
  if (uuid)
    query.activeTopicId = uuid

  if (push)
    router.push({ path: '/forum', query })
  else
    router.replace({ path: '/forum', query })
}

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
  fetchLatestReplies,
  fetchTodayCount,
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
      void Promise.all([fetchLatestReplies(), fetchTodayCount()])
    }
    hiddenAt = null
  }
}

onMounted(() => {
  lastFeedVisitedAt.value = forumUnread.recordFeedVisit()
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
  onReply: prependReplyItem,
  onDiscussion: prependDiscussionItem,
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

async function fetchDiscussionsIndex() {
  const cached = forumCache.get<ForumDiscussion[]>(FORUM_DISCUSSIONS_INDEX_CACHE_KEY)
  if (cached !== null) {
    allDiscussions.value = cached
    return
  }

  const { data, error } = await supabase
    .from('discussions')
    .select('id, title, slug, description, is_sticky, is_locked, is_archived, is_draft, is_nsfw, reply_count, view_count, last_activity_at, created_at, created_by, modified_at, modified_by, discussion_topic_id, pinned_reply_id, event_id, gameserver_id, project_id, profile_id, referendum_id')
    .eq('is_draft', false)
    .not('discussion_topic_id', 'is', null)

  if (!error && data) {
    allDiscussions.value = data as ForumDiscussion[]
    forumCache.set(FORUM_DISCUSSIONS_INDEX_CACHE_KEY, allDiscussions.value, FORUM_DISCUSSIONS_INDEX_TTL)
  }
}

onBeforeMount(async () => {
  loading.value = true

  // ── Topics + nested discussions ──────────────────────────────────────────
  // Cache for 5 minutes. New discussions and reply counts change frequently
  // enough that a short TTL is appropriate, but remounting within a session
  // (back navigation) should never refetch.
  const cachedTopics = forumCache.get<TopicWithDiscussions[]>(FORUM_TOPICS_CACHE_KEY)

  if (cachedTopics !== null) {
    topics.value = cachedTopics
    forumUnread.initializeTopicsOnly(cachedTopics)

    if (activeTopicSlug.value) {
      const matched = cachedTopics.find(t => t.slug === activeTopicSlug.value)
      if (matched) {
        activeTopicId.value = matched.id
        loadTopicOrChildren(matched.id)
      }
    }
    else if (activeTopicIdQuery.value) {
      const matched = cachedTopics.find(t => t.id === activeTopicIdQuery.value)
      if (matched) {
        activeTopicId.value = matched.id
        if (matched.slug)
          _setQuery(matched.slug, null, false)
        loadTopicOrChildren(matched.id)
      }
    }
    else {
      // Root view - load discussions for all top-level visible topics
      for (const topic of getTopicsByParentId(null)) {
        loadTopicOrChildren(topic.id)
      }
    }
  }
  else {
    await supabase
      .from('discussion_topics')
      .select('*')
      .then(({ data, error }) => {
        if (error) {
          topicsError.value = error.message
        }
        else {
          const mapped: TopicWithDiscussions[] = (data ?? []).map(t => ({
            ...t,
            discussions: [],
            stickyDiscussions: [],
            discussionsLoaded: false,
          } as TopicWithDiscussions))
          topics.value = mapped
          forumCache.set(FORUM_TOPICS_CACHE_KEY, mapped, FORUM_TOPICS_TTL)

          // Seed localStorage seen-state for topics. First-time visitors get everything
          // marked as "seen" so only future activity triggers the new-post dots.
          forumUnread.initializeTopicsOnly(mapped)

          // Restore active topic from URL query params (replace-only – no new history entry)
          if (activeTopicSlug.value) {
            const matchedTopic = mapped.find(topic => topic.slug === activeTopicSlug.value)
            if (matchedTopic) {
              activeTopicId.value = matchedTopic.id
              loadTopicOrChildren(matchedTopic.id)
            }
          }
          else if (activeTopicIdQuery.value) {
            const matchedTopic = mapped.find(topic => topic.id === activeTopicIdQuery.value)
            if (matchedTopic) {
              activeTopicId.value = matchedTopic.id
              // Upgrade UUID → slug silently (replace, not push)
              if (matchedTopic.slug) {
                _setQuery(matchedTopic.slug, null, false)
              }
              loadTopicOrChildren(matchedTopic.id)
            }
          }
          else {
            // Root view - load discussions for all top-level visible topics
            for (const topic of getTopicsByParentId(null)) {
              loadTopicOrChildren(topic.id)
            }
          }
        }
      })
  }

  // ── Discussion index + latest replies ────────────────────────────────────
  await Promise.all([fetchDiscussionsIndex(), fetchLatestReplies(), fetchTodayCount()])

  loading.value = false

  // Start realtime subscription after initial data is loaded so that the
  // discussionLookup and visibleDiscussionIds are populated for filtering.
  subscribeForumFeed()
})

const activeTopicPath = computed(() => composePathToTopic(activeTopicId.value, topics.value))

const breadcrumbItems = computed(() =>
  activeTopicPath.value.map((item, index) => ({
    id: item.parent_id,
    label: item.title,
    is_archived: item.is_archived,
    onClick: index !== activeTopicPath.value.length - 1
      ? () => setActiveTopicById(item.parent_id)
      : undefined,
    onMiddleClick: index !== activeTopicPath.value.length - 1
      ? () => handleBreadcrumbMiddleClick(`/forum?activeTopicId=${item.parent_id}`)
      : undefined,
  })),
)

// ── Per-topic lazy discussion loading ────────────────────────────────────

const topicDiscussionsLoading = ref<Set<string>>(new Set())
const topicPaginationLoading = ref<Set<string>>(new Set())

const DISCUSSION_SELECT = 'id, title, slug, description, is_sticky, is_locked, is_archived, is_draft, is_nsfw, reply_count, view_count, last_activity_at, created_at, created_by, modified_at, modified_by, discussion_topic_id, pinned_reply_id, event_id, gameserver_id, project_id, profile_id, referendum_id'

async function loadTopicDiscussions(topicId: string, page: number = 0, isExplicitPageChange: boolean = false) {
  const topic = topics.value.find(t => t.id === topicId)
  // On first load (page 0) guard against duplicate fetches and already-loaded state.
  // Skip the already-loaded guard when this is an explicit pagination action (e.g. clicking page 1 again).
  // On subsequent pages always allow the fetch.
  if (!topic)
    return
  if (page === 0 && !isExplicitPageChange && (topic.discussionsLoaded || topicDiscussionsLoading.value.has(topicId)))
    return
  if (page === 0 && isExplicitPageChange && topicPaginationLoading.value.has(topicId))
    return
  if (page > 0 && topicPaginationLoading.value.has(topicId))
    return

  // Check cache - key encodes topicId, page, sort column and direction so
  // any previously fetched combination hits instantly, new combos miss and fetch.
  const cacheKey = topicDiscussionsCacheKey(topicId, page, sortColumn.value, sortAscending.value)
  const cached = forumCache.get<TopicDiscussionsPage>(cacheKey)
  if (cached !== null) {
    const idx = topics.value.findIndex(t => t.id === topicId)
    if (idx !== -1 && topics.value[idx]) {
      const currentTopic = topics.value[idx]!
      topics.value[idx] = {
        ...currentTopic,
        discussions: cached.discussions,
        stickyDiscussions: page === 0 ? cached.stickyDiscussions : currentTopic.stickyDiscussions,
        discussionsLoaded: true,
      }
      if (page === 0 && cached.totalCount !== null) {
        topicPagination.value = {
          ...topicPagination.value,
          [topicId]: { page, totalCount: cached.totalCount },
        }
      }
      forumUnread.initializeTopics([{
        id: topicId,
        last_activity_at: currentTopic.last_activity_at,
        discussions: [...(page === 0 ? cached.stickyDiscussions : currentTopic.stickyDiscussions), ...cached.discussions],
      }])
    }
    return
  }

  const isPagination = page > 0 || isExplicitPageChange
  if (isPagination) {
    topicPaginationLoading.value = new Set([...topicPaginationLoading.value, topicId])
  }
  else {
    topicDiscussionsLoading.value = new Set([...topicDiscussionsLoading.value, topicId])
  }

  const from = page * TOPIC_PAGE_SIZE
  const to = from + TOPIC_PAGE_SIZE - 1

  // Sticky discussions are always fetched on first load and kept separately.
  // Non-sticky discussions are paginated.
  const [stickyResult, pageResult, countResult] = await Promise.all([
    page === 0
      ? supabase
          .from('discussions')
          .select(DISCUSSION_SELECT)
          .eq('discussion_topic_id', topicId)
          .eq('is_draft', false)
          .eq('is_sticky', true)
          .order(sortColumn.value, { ascending: sortAscending.value })
      : Promise.resolve({ data: null, error: null }),

    supabase
      .from('discussions')
      .select(DISCUSSION_SELECT)
      .eq('discussion_topic_id', topicId)
      .eq('is_draft', false)
      .eq('is_sticky', false)
      .order(sortColumn.value, { ascending: sortAscending.value })
      .range(from, to),

    page === 0
      ? supabase
          .from('discussions')
          .select('id', { count: 'exact', head: true })
          .eq('discussion_topic_id', topicId)
          .eq('is_draft', false)
          .eq('is_sticky', false)
      : Promise.resolve({ count: null, error: null }),
  ])

  topicDiscussionsLoading.value = new Set([...topicDiscussionsLoading.value].filter(id => id !== topicId))
  topicPaginationLoading.value = new Set([...topicPaginationLoading.value].filter(id => id !== topicId))

  if (pageResult.error || !pageResult.data)
    return

  const idx = topics.value.findIndex(t => t.id === topicId)
  if (idx === -1)
    return

  const currentTopic = topics.value[idx]
  if (!currentTopic)
    return

  const stickyDiscussions: ForumDiscussion[] = page === 0
    ? (stickyResult.data ?? []) as ForumDiscussion[]
    : currentTopic.stickyDiscussions

  const updatedTopic: TopicWithDiscussions = {
    ...currentTopic,
    discussions: pageResult.data as ForumDiscussion[],
    stickyDiscussions,
    discussionsLoaded: true,
  }
  topics.value[idx] = updatedTopic

  // Update pagination state
  const prevPagination = topicPagination.value[topicId]
  const newTotalCount = page === 0 ? (countResult.count ?? prevPagination?.totalCount ?? 0) : (prevPagination?.totalCount ?? 0)
  topicPagination.value = {
    ...topicPagination.value,
    [topicId]: {
      page,
      totalCount: newTotalCount,
    },
  }

  // Cache results for re-navigation within TTL
  forumCache.set<TopicDiscussionsPage>(cacheKey, {
    discussions: pageResult.data as ForumDiscussion[],
    stickyDiscussions: page === 0 ? stickyDiscussions : currentTopic.stickyDiscussions,
    totalCount: page === 0 ? newTotalCount : null,
  }, TOPIC_DISCUSSIONS_TTL)

  // Seed unread state for newly loaded discussions
  forumUnread.initializeTopics([{
    id: updatedTopic.id,
    last_activity_at: updatedTopic.last_activity_at,
    discussions: [...updatedTopic.stickyDiscussions, ...updatedTopic.discussions],
  }])
}

function getTopicPagination(topicId: string): TopicPaginationState | null {
  return topicPagination.value[topicId] ?? null
}

async function goToTopicPage(topicId: string, page: number) {
  // Pass isExplicitPageChange=true so the discussionsLoaded guard is bypassed,
  // allowing re-fetching page 0 when the user clicks page 1 more than once.
  await loadTopicDiscussions(topicId, page, true)
  window.scrollTo(0, 0)
}

/**
 * Navigate to a topic by its ID. Used by the breadcrumb back-navigation where
 * going "up" the tree should push a history entry so the user can go forward
 * again.
 */
function setActiveTopicById(topicId: string | null) {
  activeTopicId.value = topicId

  if (!topicId) {
    // Navigating back to the root – clear query and push so back-button works
    _setQuery(null, null, true)
    return
  }

  loadTopicOrChildren(topicId)

  const matchedTopic = topics.value.find(topic => topic.id === topicId)

  if (matchedTopic?.slug) {
    _setQuery(matchedTopic.slug, null, true)
  }
  else {
    // No slug yet – use UUID but don't pollute history (replace);
    // slug will be upgraded silently once available.
    _setQuery(null, topicId, false)
  }
}

/**
 * Navigate into a topic (e.g. clicking a topic row). Always pushes a history
 * entry so the back-button can return to the previous topic. When the topic has
 * no slug yet we use replace for the UUID entry, then replace again once we can
 * upgrade to the slug – this avoids a spurious UUID entry in history.
 */
function setActiveTopicFromTopic(topic: TopicWithDiscussions) {
  activeTopicId.value = topic.id

  // Mark this topic as seen so the new-post dot clears after navigation
  forumUnread.markTopicSeen(topic.id)

  loadTopicOrChildren(topic.id)

  if (topic.slug) {
    _setQuery(topic.slug, null, true)
  }
  else {
    // UUID fallback – replace so history only gets an entry once the slug lands
    _setQuery(null, topic.id, false)
  }
}

// Watch route query changes driven externally (e.g. browser back/forward)
watch(
  () => route.query,
  (query) => {
    const slug = (query.activeTopic as string | null) ?? null
    const uuid = (query.activeTopicId as string | null) ?? null

    if (!slug && !uuid) {
      activeTopicId.value = null
      return
    }

    if (slug) {
      const matched = topics.value.find(t => t.slug === slug)
      if (matched) {
        activeTopicId.value = matched.id
        loadTopicOrChildren(matched.id)
      }
      return
    }

    if (uuid) {
      const matched = topics.value.find(t => t.id === uuid)
      if (matched) {
        activeTopicId.value = matched.id
        loadTopicOrChildren(matched.id)
        // Silently upgrade UUID → slug if possible
        if (matched.slug)
          _setQuery(matched.slug, null, false)
      }
    }
  },
)

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

// Filter discussions by visibility settings. DB already orders by last_activity_at
// so we preserve that order - re-sorting would scramble pagination.
function sortDiscussions(discussions: ForumDiscussion[]) {
  let filtered = settings.value.show_forum_archived
    ? discussions
    : discussions.filter(discussion => !discussion.is_archived)

  if (!settings.value.show_nsfw_content) {
    filtered = filtered.filter(discussion => !discussion.is_nsfw)
  }

  // DB owns ordering; no client-side sort needed
  return filtered
}

function sortIcon(col: SortColumn) {
  if (sortColumn.value !== col)
    return null
  return sortAscending.value ? 'ph:arrow-up' : 'ph:arrow-down'
}

// List topics based on the activeTopicId. If it's null, list all topics
// without a parent_id, otherwise list all topics which match the activeTopicId
const modelledTopics = computed(() => {
  if (!activeTopicId.value) {
    return getTopicsByParentId(null).toSorted(sortTopicsByPriority)
  }

  // If the active topic has children, show those children as cards - same
  // expansion behavior as the root level. This lets e.g. "General" display
  // Books, Garage, Music etc. as individual expandable cards.
  const children = getTopicsByParentId(activeTopicId.value)
  if (children.length > 0) {
    const parent = topics.value.find(t => t.id === activeTopicId.value)
    const sorted = children.toSorted(sortTopicsByPriority)
    // Always prepend the parent as a card so its own direct discussions are
    // visible alongside child topic cards (e.g. pinned posts on "Hivecom").
    if (parent) {
      return [parent, ...sorted]
    }
    return sorted
  }

  // No children - show the topic itself (discussion list view).
  // Always include the explicitly-navigated topic even if archived.
  const topic = topics.value.find(t => t.id === activeTopicId.value)
  return topic ? [topic] : []
})

function sortTopicsByPriority(a: { priority: number, name: string }, b: { priority: number, name: string }) {
  const aHasOrder = a.priority !== 0
  const bHasOrder = b.priority !== 0

  if (aHasOrder && bHasOrder) {
    if (a.priority === b.priority) {
      return a.name.localeCompare(b.name)
    }
    return b.priority - a.priority
  }

  if (aHasOrder && !bHasOrder)
    return -1
  if (!aHasOrder && bHasOrder)
    return 1

  return a.name.localeCompare(b.name)
}

// Return all topics which have the given parent id. Used to list nested topics
function getTopicsByParentId(parentId: string | null) {
  let filtered = topics.value.filter(topic => topic.parent_id === parentId)

  // Filter out archived topics
  if (!settings.value.show_forum_archived) {
    filtered = filtered.filter(item => !item.is_archived)
  }

  return filtered.toSorted(sortTopicsByPriority)
}

// When discussion is created, append it to the selected parent topic
function appendDiscussionToTopic(discussion: Tables<'discussions'>) {
  const topic = topics.value.find(t => t.id === discussion.discussion_topic_id)
  if (topic) {
    if (discussion.is_sticky) {
      topic.stickyDiscussions = [discussion, ...topic.stickyDiscussions]
    }
    else {
      topic.discussions = [discussion, ...topic.discussions]
      // Bump total count
      const pag = topicPagination.value[topic.id]
      if (pag) {
        topicPagination.value = {
          ...topicPagination.value,
          [topic.id]: { ...pag, totalCount: pag.totalCount + 1 },
        }
      }
    }
    topic.discussionsLoaded = true
    // Also add to the global discussions index so the activity feed sees it immediately
    if (!allDiscussions.value.some(d => d.id === discussion.id))
      allDiscussions.value = [discussion, ...allDiscussions.value]
    // Bust topic discussion page caches for all pages of this topic so next open fetches fresh
    forumCache.invalidateByPattern(new RegExp(`^topic-discussions:${discussion.discussion_topic_id}:`))
    forumCache.delete(FORUM_DISCUSSIONS_INDEX_CACHE_KEY)
    // You created this discussion - seed it as seen so initializeTopics doesn't
    // treat it as an unseen discussion in a known topic (seenReplyCount = -1).
    forumUnread.markDiscussionSeen(discussion.id, discussion.reply_count ?? 0)
    // Advance the topic watermark to now so the act of creating a discussion
    // doesn't produce a topic dot when returning from the discussion page.
    if (discussion.discussion_topic_id)
      forumUnread.markTopicSeen(discussion.discussion_topic_id)
  }
}

function changeSort(col: SortColumn) {
  if (sortColumn.value === col) {
    sortAscending.value = !sortAscending.value
  }
  else {
    sortColumn.value = col
    sortAscending.value = false
  }

  // Reload visible topics using pagination-style dimming (keeps existing items
  // visible and dimmed) rather than wiping to skeletons - skeletons are for
  // initial load only.
  const reloadTopic = (id: string) => {
    topicPagination.value = {
      ...topicPagination.value,
      [id]: { page: 0, totalCount: topicPagination.value[id]?.totalCount ?? 0 },
    }
    loadTopicDiscussions(id, 0, true)
  }

  for (const topic of modelledTopics.value) {
    reloadTopic(topic.id)
    for (const child of getTopicsByParentId(topic.id))
      reloadTopic(child.id)
  }
}

// Load discussions for a topic, or if it has children, load all children's discussions.
// Used when navigating into a topic so the correct cards are populated.
function loadTopicOrChildren(topicId: string) {
  const children = getTopicsByParentId(topicId)
  if (children.length > 0) {
    // Load children's discussions for the sub-topic cards
    for (const child of children) {
      loadTopicDiscussions(child.id)
    }
    // Also load the parent's own direct discussions (e.g. pinned items on a
    // parent topic that also has sub-topic children)
    loadTopicDiscussions(topicId)
  }
  else {
    loadTopicDiscussions(topicId)
  }
}

// Auto-scroll to the top of the page whenever nested topic is changed
watch(activeTopicId, () => {
  window.scrollTo(0, 0)
})

// Update methods - whenever a topic or a discussion is updated, replace the new
// object with the old one ot avoid the need to fetch data
function replaceItemData(type: 'topic' | 'discussion', data: Tables<'discussion_topics'> | Tables<'discussions'>) {
  if (type === 'topic') {
    const index = topics.value.findIndex(({ id }) => id === data.id)
    const oldTopic = topics.value[index]

    // Merge the updated data with the old topic, preserving discussions
    topics.value = topics.value.toSpliced(index, 1, { ...oldTopic, ...data } as TopicWithDiscussions)
  }
  else {
    const updatedDiscussion = data as Tables<'discussions'>
    const parentTopic = topics.value.find(topic =>
      topic.discussions.some(discussion => discussion.id === data.id),
    )
    if (parentTopic) {
      const discussionIndex = parentTopic.discussions.findIndex(({ id }) => id === data.id)
      const oldDiscussion = parentTopic.discussions[discussionIndex]
      const merged = { ...oldDiscussion, ...updatedDiscussion } as ForumDiscussion

      if (updatedDiscussion.discussion_topic_id !== parentTopic.id) {
        // Discussion was moved to a different topic - remove from old, add to new
        parentTopic.discussions.splice(discussionIndex, 1)
        const newParentTopic = topics.value.find(topic => topic.id === updatedDiscussion.discussion_topic_id)
        if (newParentTopic) {
          newParentTopic.discussions.push(merged)
        }
      }
      else {
        parentTopic.discussions[discussionIndex] = merged
      }
    }
  }
  // Bust cache so remounts reflect the mutation.
  if (type === 'discussion') {
    const updatedDiscussion = data as ForumDiscussion
    // Invalidate per-topic discussion page cache for affected topic(s)
    if (updatedDiscussion.discussion_topic_id) {
      forumCache.invalidateByPattern(new RegExp(`^topic-discussions:${updatedDiscussion.discussion_topic_id}:`))
    }
    // Keep the global index in sync with updated discussion data
    const indexIdx = allDiscussions.value.findIndex(d => d.id === updatedDiscussion.id)
    if (indexIdx !== -1)
      allDiscussions.value = allDiscussions.value.toSpliced(indexIdx, 1, updatedDiscussion)
    // Also update stickyDiscussions if the discussion is sticky
    const stickyParentTopic = topics.value.find(t =>
      t.stickyDiscussions.some(d => d.id === updatedDiscussion.id),
    )
    if (stickyParentTopic) {
      const si = stickyParentTopic.stickyDiscussions.findIndex(d => d.id === updatedDiscussion.id)
      if (si !== -1)
        stickyParentTopic.stickyDiscussions[si] = updatedDiscussion
    }
    forumCache.delete(FORUM_DISCUSSIONS_INDEX_CACHE_KEY)
  }
}

const { navigate: navigateToRandomDiscussion } = useDiscoverQueue()

// Remove methods - remove a topic or discussion from local state after deletion
function removeItem(type: 'topic' | 'discussion', id: string) {
  if (type === 'topic') {
    topics.value = topics.value.filter(topic => topic.id !== id)

    // If the removed topic was the active one, reset navigation
    if (activeTopicId.value === id) {
      activeTopicId.value = null
      _setQuery(null, null, false)
    }
  }
  else {
    const parentTopic = topics.value.find(topic =>
      topic.discussions.some(discussion => discussion.id === id),
    )
    if (parentTopic) {
      parentTopic.discussions = parentTopic.discussions.filter(discussion => discussion.id !== id)
    }
    allDiscussions.value = allDiscussions.value.filter(d => d.id !== id)
    // Also remove from stickyDiscussions if present
    const stickyParent = topics.value.find(t => t.stickyDiscussions.some(d => d.id === id))
    if (stickyParent) {
      stickyParent.stickyDiscussions = stickyParent.stickyDiscussions.filter(d => d.id !== id)
    }
    // Decrement total count
    const discussionTopicId = topics.value.find(t => t.discussions.some(d => d.id === id))?.id
    if (discussionTopicId) {
      const pag = topicPagination.value[discussionTopicId]
      if (pag) {
        topicPagination.value = {
          ...topicPagination.value,
          [discussionTopicId]: { ...pag, totalCount: Math.max(0, pag.totalCount - 1) },
        }
      }
      forumCache.invalidateByPattern(new RegExp(`^topic-discussions:${discussionTopicId}:`))
    }
    forumCache.delete(FORUM_DISCUSSIONS_INDEX_CACHE_KEY)
  }
}

onBeforeMount(() => {
  fetchDraftCount()
})

function handleBreadcrumbMiddleClick(path: string = '/forum') {
  window.open(path, '_blank')
}
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
        :last-visited-at="lastFeedVisitedAt"
        :mention-lookup="mentionLookup"
        :feed-options="feedOptions"
        :feed-pending-count="feedPendingCount"
        @feed-reloaded="feedPendingCount = 0"
      />

      <Flex x-start y-center class="mb-m" :gap="isMobile ? 'xxs' : 'xs'">
        <Button :disabled="!activeTopicId" size="s" :square="!isMobile" outline @click="setActiveTopicById(activeTopicPath.at(-2)?.parent_id ?? null)" @click.middle.prevent="() => {}">
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

            <Dropdown v-if="user.role === 'admin' || user.role === 'moderator'">
              <template #trigger="{ toggle }">
                <Button size="s" variant="accent" :square="isMobile" @click="toggle">
                  <template v-if="!isMobile" #start>
                    <Icon name="ph:plus" :size="16" />
                  </template>
                  <template v-if="isMobile">
                    <Icon name="ph:plus" :size="16" />
                  </template>
                  {{ isMobile ? '' : 'Create' }}
                </Button>
              </template>
              <DropdownItem size="s" @click="requestCreate('discussion')">
                Discussion
                <template v-if="draftCount > 0" #hint>
                  <SharedTinyBadge>
                    {{ draftCount }} Draft{{ draftCount > 1 ? 's' : '' }}
                  </SharedTinyBadge>
                </template>
              </DropdownItem>
              <DropdownItem size="s" @click="requestCreate('topic')">
                Topic
              </DropdownItem>
            </Dropdown>

            <!-- Non-admin or moderators can only create a discussion -->
            <Button v-else variant="accent" size="s" :square="isMobile" @click="requestCreate('discussion')">
              <template v-if="!isMobile" #start>
                <Icon name="ph:plus" :size="16" />
              </template>
              <template v-if="isMobile">
                <Icon name="ph:plus" :size="16" />
              </template>
              {{ isMobile ? '' : 'Discussion' }}
            </Button>
          </template>
          <template v-else>
            <Tooltip placement="top">
              <template #tooltip>
                <p>Sign-in to start a discussion</p>
              </template>
              <Button size="s" variant="gray" :square="isMobile" disabled>
                <template v-if="!isMobile" #start>
                  <Icon name="ph:plus" :size="16" />
                </template>
                <template v-if="isMobile">
                  <Icon name="ph:plus" :size="16" />
                </template>
                {{ isMobile ? '' : 'Create' }}
              </Button>
            </Tooltip>
          </template>

          <Button size="s" :square="isMobile" @click="openCommand(['discussion_topic', 'discussion'])">
            <template v-if="!isMobile" #start>
              <Icon name="ph:magnifying-glass" :size="16" />
            </template>
            <template v-if="isMobile">
              <Icon name="ph:magnifying-glass" :size="16" />
            </template>
            {{ isMobile ? '' : 'Search' }}
          </Button>

          <Button size="s" :square="isMobile" @click="rulesModalOpen = true">
            <template v-if="!isMobile" #start>
              <Icon name="ph:book" :size="16" />
            </template>
            <template v-if="isMobile">
              <Icon name="ph:book" :size="16" />
            </template>
            {{ isMobile ? '' : 'Rules' }}
          </Button>
          <ContentRulesModal v-model:open="rulesModalOpen" :show-agree-button="false" />
          <ContentRulesModal
            v-model:open="contentRulesGateOpen"
            :show-agree-button="true"
            @confirm="handleContentRulesConfirmed"
            @cancel="handleContentRulesCanceled"
          />

          <Button size="s" :square="isMobile" @click="navigateToRandomDiscussion">
            <template v-if="!isMobile" #start>
              <Icon name="ph:shuffle" :size="16" />
            </template>
            <template v-if="isMobile">
              <Icon name="ph:shuffle" :size="16" />
            </template>
            {{ isMobile ? '' : 'Discover' }}
          </Button>

          <Button ref="settings-anchor" size="s" square @click="showSettings = !showSettings">
            <Icon name="ph:gear" />
          </Button>

          <Popout :visible="showSettings" :anchor="settingsAnchor" placement="bottom" @click-outside="showSettings = false">
            <Flex column class="p-m" gap="s" expand>
              <Flex x-between y-center expand>
                <span class="text-m mb-xs text-color-light">Display options</span>
                <NuxtLink to="/profile/settings">
                  <Button size="s">
                    All settings
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
              :has-new="settings.show_forum_unread_bubbles && forumUnread.isTopicNewWithDiscussions(subtopic.id, subtopic.last_activity_at, [...(subtopic.stickyDiscussions ?? []), ...(subtopic.discussions ?? [])], subtopic.discussionsLoaded)"
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
              :has-new="settings.show_forum_unread_bubbles && forumUnread.isDiscussionNew(discussion.id, discussion.reply_count)"
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
              :has-new="settings.show_forum_unread_bubbles && forumUnread.isDiscussionNew(discussion.id, discussion.reply_count)"
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
    </ClientOnly>
  </div>
</template>

<style lang="scss">
@use '@/assets/breakpoints.scss' as *;
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
