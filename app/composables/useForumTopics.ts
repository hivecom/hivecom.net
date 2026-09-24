import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { useCache } from '@/composables/useCache'
import { useDataForumUnread } from '@/composables/useDataForumUnread'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'
import { composePathToTopic } from '@/lib/topics'

export type ForumDiscussion = Tables<'discussions'>

export type TopicWithDiscussions = Tables<'discussion_topics'> & {
  discussions: ForumDiscussion[]
  stickyDiscussions: ForumDiscussion[]
  discussionsLoaded: boolean
}

export type SortColumn = 'last_activity_at' | 'reply_count' | 'view_count'

const FORUM_TOPICS_CACHE_KEY = 'topics-v3'
const FORUM_TOPICS_TTL = 5 * 60 * 1000

// Lightweight index for the activity feed. Loaded independently of the lazy
// per-topic loads so the feed works without opening a topic.
const FORUM_DISCUSSIONS_INDEX_CACHE_KEY = 'discussions-index:v1'
const FORUM_DISCUSSIONS_INDEX_TTL = 5 * 60 * 1000

const TOPIC_DISCUSSIONS_TTL = 3 * 60 * 1000
function topicDiscussionsCacheKey(topicId: string, page: number, sort: SortColumn, asc: boolean): string {
  return `topic-discussions:${topicId}:${page}:${sort}:${asc ? 'asc' : 'desc'}`
}

interface TopicDiscussionsPage {
  discussions: ForumDiscussion[]
  stickyDiscussions: ForumDiscussion[]
  totalCount: number | null
}

// Shared by the index and the per-topic loads so both return the same row shape.
const DISCUSSION_SELECT = 'id, title, slug, description, is_sticky, is_locked, is_archived, is_draft, is_nsfw, reply_count, view_count, last_activity_at, last_activity_by, created_at, created_by, modified_at, modified_by, discussion_topic_id, pinned_reply_id, event_id, gameserver_id, project_id, profile_id, referendum_id'

const TOPIC_PAGE_SIZE = 15

interface TopicPaginationState {
  page: number
  totalCount: number
}

/**
 * The forum topic tree: lazy per-topic discussion loading, pagination, sort,
 * URL-driven active topic and the topic and discussion mutations.
 */
export function useForumTopics() {
  const route = useRoute()
  const router = useRouter()
  const supabase = useSupabaseClient<Database>()
  const forumCache = useCache(CACHE_NAMESPACES.forum)
  const forumUnread = useDataForumUnread()
  const { settings } = useDataUserSettings()

  const sortColumn = ref<SortColumn>('last_activity_at')
  const sortAscending = ref(false)

  const loading = ref(false)

  const topicsError = ref<string | null>(null)
  const topics = ref<TopicWithDiscussions[]>([])

  const allDiscussions = ref<ForumDiscussion[]>([])

  // Keyed by topicId
  const topicPagination = ref<Record<string, TopicPaginationState>>({})

  // Pathing and topic nesting
  const activeTopicId = ref<string | null>(null)

  // Read-only views of the route query. Writes go through _setQuery, which picks
  // router.push or router.replace to control whether a change adds a history
  // entry.
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

  // push adds a history entry, otherwise the current one is replaced.
  function _setQuery(slug: string | null, uuid: string | null, push: boolean) {
    const query: Record<string, string> = {}
    if (slug)
      query.activeTopic = slug
    if (uuid)
      query.activeTopicId = uuid

    if (push)
      void router.push({ path: '/forum', query })
    else
      void router.replace({ path: '/forum', query })
  }

  async function fetchDiscussionsIndex() {
    const cached = forumCache.get<ForumDiscussion[]>(FORUM_DISCUSSIONS_INDEX_CACHE_KEY)
    if (cached !== null) {
      allDiscussions.value = cached
      return
    }

    const { data, error } = await supabase
      .from('discussions')
      .select(DISCUSSION_SELECT)
      .eq('is_draft', false)
      .not('discussion_topic_id', 'is', null)

    if (!error && data) {
      allDiscussions.value = data as ForumDiscussion[]
      forumCache.set(FORUM_DISCUSSIONS_INDEX_CACHE_KEY, allDiscussions.value, FORUM_DISCUSSIONS_INDEX_TTL)
    }
  }

  // A bare URL with neither ?activeTopic nor ?activeTopicId clears the active
  // topic and loads all top-level topics.
  function resolveActiveTopicFromQuery() {
    const slug = activeTopicSlug.value
    const uuid = activeTopicIdQuery.value

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

        // Upgrade the UUID to the slug with replace, so no new history entry.
        if (matched.slug)
          _setQuery(matched.slug, null, false)
        loadTopicOrChildren(matched.id)
      }
      return
    }

    // Root view. The discussionsLoaded guard makes reloading a no-op for topics
    // that are still populated.
    activeTopicId.value = null
    for (const topic of getTopicsByParentId(null))
      loadTopicOrChildren(topic.id)
  }

  async function loadTopics() {
    loading.value = true

    // ── Topics + nested discussions ──────────────────────────────────────────
    // Short TTL since discussions and reply counts change often, but long enough
    // that back navigation doesn't refetch.
    const cachedTopics = forumCache.get<TopicWithDiscussions[]>(FORUM_TOPICS_CACHE_KEY)

    if (cachedTopics !== null) {
      topics.value = cachedTopics
      forumUnread.initializeTopicsOnly(cachedTopics)
      resolveActiveTopicFromQuery()
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
            }))
            topics.value = mapped
            forumCache.set(FORUM_TOPICS_CACHE_KEY, mapped, FORUM_TOPICS_TTL)

            // First-time visitors get everything marked seen so only future
            // activity triggers the new-post dots.
            forumUnread.initializeTopicsOnly(mapped)

            resolveActiveTopicFromQuery()
          }
        })
    }

    // ── Discussion index ──────────────────────────────────────────────────────
    await fetchDiscussionsIndex()

    loading.value = false
  }

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

  async function loadTopicDiscussions(topicId: string, page: number = 0, isExplicitPageChange: boolean = false) {
    const topic = topics.value.find(t => t.id === topicId)

    // Page 0 skips already-loaded topics unless it's an explicit page change,
    // like clicking page 1 again.
    if (!topic)
      return
    if (page === 0 && !isExplicitPageChange && (topic.discussionsLoaded || topicDiscussionsLoading.value.has(topicId)))
      return
    if (page === 0 && isExplicitPageChange && topicPaginationLoading.value.has(topicId))
      return
    if (page > 0 && topicPaginationLoading.value.has(topicId))
      return

    const cacheKey = topicDiscussionsCacheKey(topicId, page, sortColumn.value, sortAscending.value)
    const cached = forumCache.get<TopicDiscussionsPage>(cacheKey)
    if (cached !== null) {
      const idx = topics.value.findIndex(t => t.id === topicId)
      if (idx !== -1 && topics.value[idx]) {
        const currentTopic = topics.value[idx]
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

    // Stickies load on page 0 only and sit outside pagination.
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

    const prevPagination = topicPagination.value[topicId]
    const newTotalCount = page === 0 ? (countResult.count ?? prevPagination?.totalCount ?? 0) : (prevPagination?.totalCount ?? 0)
    topicPagination.value = {
      ...topicPagination.value,
      [topicId]: {
        page,
        totalCount: newTotalCount,
      },
    }

    forumCache.set<TopicDiscussionsPage>(cacheKey, {
      discussions: pageResult.data as ForumDiscussion[],
      stickyDiscussions: page === 0 ? stickyDiscussions : currentTopic.stickyDiscussions,
      totalCount: page === 0 ? newTotalCount : null,
    }, TOPIC_DISCUSSIONS_TTL)

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
    // Explicit, so clicking page 1 again refetches past the discussionsLoaded guard.
    await loadTopicDiscussions(topicId, page, true)
    window.scrollTo(0, 0)
  }

  // Going up the tree via the breadcrumb pushes a history entry so forward works.
  function setActiveTopicById(topicId: string | null) {
    activeTopicId.value = topicId

    if (!topicId) {
      // Back to the root. Push so the back button works.
      _setQuery(null, null, true)
      return
    }

    loadTopicOrChildren(topicId)

    const matchedTopic = topics.value.find(topic => topic.id === topicId)

    if (matchedTopic?.slug) {
      _setQuery(matchedTopic.slug, null, true)
    }
    else {
      // No slug yet. The UUID goes in with replace so it doesn't pollute history.
      _setQuery(null, topicId, false)
    }
  }

  // Pushes a history entry so back returns to the previous topic. Slugless topics
  // use replace instead, which avoids a stray UUID entry in history.
  function setActiveTopicFromTopic(topic: TopicWithDiscussions) {
    activeTopicId.value = topic.id

    forumUnread.markTopicSeen(topic.id)

    loadTopicOrChildren(topic.id)

    if (topic.slug) {
      _setQuery(topic.slug, null, true)
    }
    else {
      _setQuery(null, topic.id, false)
    }
  }

  // External query changes, like browser back and forward.
  watch(
    () => route.query,
    () => resolveActiveTopicFromQuery(),
  )

  // Filter by visibility settings only. The DB returns rows in the selected sort
  // order, and re-sorting here would scramble pagination.
  function sortDiscussions(discussions: ForumDiscussion[]) {
    let filtered = settings.value.show_forum_archived
      ? discussions
      : discussions.filter(discussion => !discussion.is_archived)

    if (!settings.value.show_nsfw_content) {
      filtered = filtered.filter(discussion => !discussion.is_nsfw)
    }

    return filtered
  }

  // List topics based on the activeTopicId. If it's null, list all topics
  // without a parent_id, otherwise list all topics which match the activeTopicId
  const modelledTopics = computed(() => {
    if (!activeTopicId.value) {
      return getTopicsByParentId(null).toSorted(sortTopicsByPriority)
    }

    // Child topics show as expandable cards, same as the root level.
    const children = getTopicsByParentId(activeTopicId.value)
    if (children.length > 0) {
      const parent = topics.value.find(t => t.id === activeTopicId.value)
      const sorted = children.toSorted(sortTopicsByPriority)

      // Prepend the parent so its own discussions show next to the child cards.
      if (parent) {
        return [parent, ...sorted]
      }
      return sorted
    }

    // No children: show the topic itself, even if archived.
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

        const pag = topicPagination.value[topic.id]
        if (pag) {
          topicPagination.value = {
            ...topicPagination.value,
            [topic.id]: { ...pag, totalCount: pag.totalCount + 1 },
          }
        }
      }
      topic.discussionsLoaded = true

      // The activity feed reads the index, so add it there too.
      if (!allDiscussions.value.some(d => d.id === discussion.id))
        allDiscussions.value = [discussion, ...allDiscussions.value]

      forumCache.invalidateByPattern(new RegExp(`^topic-discussions:${discussion.discussion_topic_id}:`))
      forumCache.delete(FORUM_DISCUSSIONS_INDEX_CACHE_KEY)

      // Your own discussion starts seen. Otherwise initializeTopics treats it as
      // unseen in a known topic (seenReplyCount = -1).
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

    // Reload with pagination-style dimming. Skeletons are for the initial load only.
    const reloadTopic = (id: string) => {
      topicPagination.value = {
        ...topicPagination.value,
        [id]: { page: 0, totalCount: topicPagination.value[id]?.totalCount ?? 0 },
      }
      void loadTopicDiscussions(id, 0, true)
    }

    for (const topic of modelledTopics.value) {
      reloadTopic(topic.id)
      for (const child of getTopicsByParentId(topic.id))
        reloadTopic(child.id)
    }
  }

  function loadTopicOrChildren(topicId: string) {
    const children = getTopicsByParentId(topicId)
    if (children.length > 0) {
      for (const child of children) {
        void loadTopicDiscussions(child.id)
      }

      // The parent's own discussions show next to the child cards.
      void loadTopicDiscussions(topicId)
    }
    else {
      void loadTopicDiscussions(topicId)
    }
  }

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
          // Moved to a different topic.
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

      if (updatedDiscussion.discussion_topic_id) {
        forumCache.invalidateByPattern(new RegExp(`^topic-discussions:${updatedDiscussion.discussion_topic_id}:`))
      }

      const indexIdx = allDiscussions.value.findIndex(d => d.id === updatedDiscussion.id)
      if (indexIdx !== -1)
        allDiscussions.value = allDiscussions.value.toSpliced(indexIdx, 1, updatedDiscussion)

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

  function removeItem(type: 'topic' | 'discussion', id: string) {
    if (type === 'topic') {
      topics.value = topics.value.filter(topic => topic.id !== id)

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

      const stickyParent = topics.value.find(t => t.stickyDiscussions.some(d => d.id === id))
      if (stickyParent) {
        stickyParent.stickyDiscussions = stickyParent.stickyDiscussions.filter(d => d.id !== id)
      }

      // Captured before the filter above removed the discussion from the topic.
      const discussionTopicId = parentTopic?.id
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

  function handleBreadcrumbMiddleClick(path: string = '/forum') {
    window.open(path, '_blank')
  }

  return {
    // state
    topics,
    allDiscussions,
    topicsError,
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
    // actions
    changeSort,
    getTopicPagination,
    getTopicsByParentId,
    sortDiscussions,
    setActiveTopicById,
    setActiveTopicFromTopic,
    resolveActiveTopicFromQuery,
    loadTopicOrChildren,
    loadTopicDiscussions,
    goToTopicPage,
    appendDiscussionToTopic,
    replaceItemData,
    removeItem,
    fetchDiscussionsIndex,
    loadTopics,
    handleBreadcrumbMiddleClick,
  }
}
