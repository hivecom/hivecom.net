<script setup lang="ts">
import type { Command } from '@dolanske/vui'
import type { Tables } from '@/types/database.overrides'
import { Badge, BreadcrumbItem, Breadcrumbs, Button, Card, Commands, Dropdown, DropdownItem, Flex, Kbd, KbdGroup, Popout, Skeleton, Switch, Tooltip } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { FORUM_KEYS } from '@/components/Forum/Forum.keys'
import ForumDiscussionItem from '@/components/Forum/ForumDiscussionItem.vue'
import ForumItemActions from '@/components/Forum/ForumItemActions.vue'
import ForumModalAddDiscussion from '@/components/Forum/ForumModalAddDiscussion.vue'
import ForumModalAddTopic from '@/components/Forum/ForumModalAddTopic.vue'
import ForumTopicItem from '@/components/Forum/ForumTopicItem.vue'
import ContentRulesModal from '@/components/Shared/ContentRulesModal.vue'
import MarkdownPreview from '@/components/Shared/MarkdownPreview.vue'
import TinyBadge from '@/components/Shared/TinyBadge.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import { extractMentionIds, processMentionsToText, stripMarkdown } from '@/lib/markdownProcessors'
import { useBreakpoint } from '@/lib/mediaQuery'
import { composedPathToString, composePathToTopic } from '@/lib/topics'
import { slugify } from '@/lib/utils/formatting'

dayjs.extend(relativeTime)

useSeoMeta({
  title: 'Forum',
  description: 'Browse and participate in discussions across the Hivecom community forum.',
  ogTitle: 'Forum',
  ogDescription: 'Browse and participate in discussions across the Hivecom community forum.',
})

type ForumDiscussion = Tables<'discussions'>

export type TopicWithDiscussions = Tables<'discussion_topics'> & {
  discussions: ForumDiscussion[]
}

interface ActivityItem {
  id: string
  type: 'Topic' | 'Discussion' | 'Reply'
  typeLabel?: string
  typeContext?: string
  title: string
  description?: string
  timestamp: string
  timestampRaw: string
  user: string
  discussionId?: string
  href?: string
  onClick?: () => void
  isArchived?: boolean
  isNsfw?: boolean
  icon: string
}

// Show display settings & store them in localStorage
const showSettings = ref(false)
const settingsAnchor = useTemplateRef('settings-anchor')

// Top level variable definitions
const userId = useUserId()
const isMobile = useBreakpoint('<s')

const { user } = useCacheUserData(userId, { includeRole: true })

// Track which topics/discussions have new content since last visit
const forumUnread = useForumUnread()

const addingTopic = ref(false)
const addingDiscussion = ref(false)
const rulesModalOpen = ref(false)
const contentRulesGateOpen = ref(false)
const agreedContentRules = ref<boolean | null>(null)
const pendingCreateAction = ref<'discussion' | 'topic' | null>(null)

const { settings } = useUserSettings()

const loading = ref(false)
const supabase = useSupabaseClient()

async function refreshContentRulesAgreement() {
  if (!userId.value) {
    agreedContentRules.value = null
    return
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('agreed_content_rules')
    .eq('id', userId.value)
    .maybeSingle()

  if (error || !data)
    return

  agreedContentRules.value = data.agreed_content_rules
}

watch(userId, () => {
  void refreshContentRulesAgreement()
}, { immediate: true })

watch(contentRulesGateOpen, (open) => {
  if (!open)
    pendingCreateAction.value = null
})

async function requestCreate(action: 'discussion' | 'topic') {
  if (agreedContentRules.value === null) {
    await refreshContentRulesAgreement()
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
  agreedContentRules.value = true
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

// Store 10 latest replies for the activity list
const latestReplies = ref<ActivityItem[]>([])

// Personal activity feed
interface UserActivityItem {
  id: string
  type: 'Reply' | 'Discussion'
  discussionId: string
  discussionTopicId: string | null
  discussionTitle: string
  discussionHref: string
  timestampRaw: string
  timestamp: string
}

const userActivity = ref<UserActivityItem[]>([])
const userActivityLoading = ref(false)

// Pathing and topic nesting (declared here so route is available for the
// userActivity route-watch below; the activeTopicId ref and query-watch remain
// in their original location further down).
const route = useRoute()
const router = useRouter()

async function fetchUserActivity(uid: string | null | undefined) {
  if (!uid) {
    userActivity.value = []
    return
  }

  // Only show loading state on first load
  if (userActivity.value.length === 0) {
    userActivityLoading.value = true
  }

  const [repliesRes, discussionsRes] = await Promise.all([
    // Use the forum_discussion_replies view which is already scoped to
    // discussions that have a discussion_topic_id (i.e. forum threads only),
    // avoiding the unreliable embedded-filter workaround on the raw table.
    supabase
      .from('forum_discussion_replies')
      .select('id, created_at, discussion_id, discussions!discussion_replies_discussion_id_fkey(id, title, slug, discussion_topic_id)')
      .eq('created_by', uid)
      .eq('is_deleted', false)
      .limit(20)
      .order('created_at', { ascending: false }),
    // Discussions the user created on the forum - we'll only surface ones
    // where the user has no reply yet (brand-new threads with 0 replies from them).
    supabase
      .from('discussions')
      .select('id, title, slug, last_activity_at, discussion_topic_id')
      .eq('created_by', uid)
      .eq('is_draft', false)
      .not('discussion_topic_id', 'is', null)
      .limit(20)
      .order('last_activity_at', { ascending: false }),
  ])

  // Build reply items - timestamp is when the user actually posted the reply

  const replyItems: UserActivityItem[] = (repliesRes.data ?? []).map((item) => {
    const discussion = Array.isArray(item.discussions) ? item.discussions[0] : item.discussions
    const slug = discussion?.slug ?? item.discussion_id
    return {
      id: item.id,
      type: 'Reply',
      discussionId: item.discussion_id,
      discussionTopicId: discussion?.discussion_topic_id ?? null,
      discussionTitle: discussion?.title ?? 'Discussion',
      discussionHref: `/forum/${slug}?comment=${item.id}`,
      timestampRaw: item.created_at,
      timestamp: dayjs(item.created_at).fromNow(),
    }
  })

  // Collect discussion IDs the user has already replied in so we don't
  // double-count them below with a stale created_at timestamp.
  const repliedDiscussionIds = new Set(replyItems.map(r => r.discussionId))

  // Only include created discussions that the user hasn't replied in yet -
  // those are already represented (with correct timestamps) via replyItems.
  const discussionItems: UserActivityItem[] = (discussionsRes.data ?? [])
    .filter(item => !repliedDiscussionIds.has(item.id))
    .map(item => ({
      id: item.id,
      type: 'Discussion' as const,
      discussionId: item.id,
      discussionTopicId: item.discussion_topic_id ?? null,
      discussionTitle: item.title,
      discussionHref: `/forum/${item.slug ?? item.id}`,
      timestampRaw: item.last_activity_at,
      timestamp: dayjs(item.last_activity_at).fromNow(),
    }))

  // Merge, sort by most recent user action, deduplicate by discussion, take top 6
  const seenDiscussionIds = new Set<string>()
  userActivity.value = [...replyItems, ...discussionItems]
    .sort((a, b) => (a.timestampRaw > b.timestampRaw ? -1 : 1))
    .filter((item) => {
      if (seenDiscussionIds.has(item.discussionId))
        return false
      seenDiscussionIds.add(item.discussionId)
      return true
    })
    .slice(0, 6)

  userActivityLoading.value = false
}

// Re-fetch when the logged-in user changes.
watch(userId, uid => fetchUserActivity(uid), { immediate: true })

// Only refetch activity when navigating back to the mainpage. Navigating
// between topics/discussions triggers the skeleton loading all the time causing
// annoying visual feedback
watch(() => route.fullPath, () => fetchUserActivity(userId.value))

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

onBeforeMount(() => {
  loading.value = true

  Promise.all([
    supabase
      .from('discussion_topics')
      .select('*, discussions(id, title, slug, description, is_sticky, is_locked, is_archived, is_draft, is_nsfw, reply_count, view_count, last_activity_at, created_at, created_by, discussion_topic_id)')
      .neq('discussions.is_draft', true)
      .then(({ data, error }) => {
        if (error) {
          topicsError.value = error.message
        }
        else {
          topics.value = data

          // Seed localStorage seen-state for any topic/discussion not yet tracked.
          // First-time visitors get everything marked as "seen" so only future
          // activity triggers the new-post dots.
          forumUnread.initializeTopics(data)

          // Restore active topic from URL query params (replace-only – no new history entry)
          if (activeTopicSlug.value) {
            const matchedTopic = data.find(topic => topic.slug === activeTopicSlug.value)
            if (matchedTopic) {
              activeTopicId.value = matchedTopic.id
            }
          }
          else if (activeTopicIdQuery.value) {
            const matchedTopic = data.find(topic => topic.id === activeTopicIdQuery.value)
            if (matchedTopic) {
              activeTopicId.value = matchedTopic.id
              // Upgrade UUID → slug silently (replace, not push)
              if (matchedTopic.slug) {
                _setQuery(matchedTopic.slug, null, false)
              }
            }
          }
        }
      }),
    // Fetch the 20 most recent replies. visibleReplies filters these down to
    // only forum-scoped discussions client-side via visibleDiscussionIds.
    supabase
      .from('forum_discussion_replies')
      .select('*')
      .limit(20)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          latestReplies.value = data.map((item) => {
            return {
              id: item.id,
              type: 'Reply',
              icon: 'ph:chats-circle',
              title: 'Reply',
              description: item.markdown,
              timestamp: `${dayjs(item.created_at).fromNow()}`,
              timestampRaw: item.created_at,
              user: item.created_by!,
              discussionId: item.discussion_id,
              href: `/forum/${item.discussion_id}?comment=${item.id}`,
              isNsfw: !!item.is_nsfw,
            }
          })
        }
      }),
  ])
    .then(() => {
      loading.value = false
    })
})

const activeTopicPath = computed(() => composePathToTopic(activeTopicId.value, topics.value))

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
  forumUnread.markTopicSeen(
    topic.id,
    topic.discussions.length,
    topic.total_reply_count ?? 0,
  )

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
      if (matched)
        activeTopicId.value = matched.id
      return
    }

    if (uuid) {
      const matched = topics.value.find(t => t.id === uuid)
      if (matched) {
        activeTopicId.value = matched.id
        // Silently upgrade UUID → slug if possible
        if (matched.slug)
          _setQuery(matched.slug, null, false)
      }
    }
  },
)

// Search implementation
const searchOpen = ref(false)

// Transform topics & discussions into a searchable list of commands. Grouped by topic & discussions
const searchResults = computed<Command[]>(() => {
  return topics.value.flatMap((topic, index) => {
    if (!settings.value.show_forum_archived && topic.is_archived)
      return []

    const topicItem = {
      title: topic.name || `Topic ${index + 1}`,
      group: 'Topics',
      description: composedPathToString(composePathToTopic(topic.parent_id, topics.value)),
      handler: () => {
        setActiveTopicById(topic.parent_id)
        searchOpen.value = false

        if (!topic.parent_id) {
          const el = document.querySelector(`#${slugify(topic.name)}`)
          el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      },
    }

    const discussionResults: Command[] = topic.discussions
      .filter(discussion => settings.value.show_forum_archived || !discussion.is_archived)
      .filter(discussion => settings.value.show_nsfw_content || !discussion.is_nsfw)
      .map((discussion, index) => {
        const fallbackTitle = discussion.title ?? `Discussion ${index + 1}`

        return {
          title: discussion.is_archived ? `${fallbackTitle} (Archived)` : fallbackTitle,
          group: 'Discussions',
          description: discussion.description ?? undefined,
          handler: () => {
            const discussionSlug = discussion.slug ?? discussion.id
            router.push(`/forum/${discussionSlug}`)
            searchOpen.value = false
          },
        }
      })

    return [topicItem, ...discussionResults]
  })
})

// Sort results by most recently modified and by sticky (pinned)
function sortDiscussions(discussions: ForumDiscussion[]) {
  let filtered = settings.value.show_forum_archived
    ? discussions
    : discussions.filter(discussion => !discussion.is_archived)

  if (!settings.value.show_nsfw_content) {
    filtered = filtered.filter(discussion => !discussion.is_nsfw)
  }

  return filtered.toSorted((a, b) => {
    if (a.is_sticky && !b.is_sticky)
      return -1
    if (!a.is_sticky && b.is_sticky)
      return 1

    return dayjs(b.last_activity_at).isAfter(dayjs(a.last_activity_at)) ? 1 : -1
  })
}

// List topics based on the activeTopicId. If it's null, list all topics
// without a parent_id, otherwise list all topics which match the activeTopicId
const modelledTopics = computed(() => {
  const filtered = !activeTopicId.value
    ? getTopicsByParentId(null)
    : topics.value.filter((topic) => {
        if (topic.id !== activeTopicId.value)
          return false
        if (!settings.value.show_forum_archived && topic.is_archived)
          return false
        return true
      })

  // Sort topics to prioritize `sort_order` and the rest is sorted
  // alphabetically below. Only manually-created topics should have a sort_order
  return filtered.toSorted((a, b) => {
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
  })
})

// Return all topics which have the given parent id. Used to list nested topics
function getTopicsByParentId(parentId: string | null) {
  let filtered = topics.value.filter(topic => topic.parent_id === parentId)

  // Filter out archived topics
  if (!settings.value.show_forum_archived) {
    filtered = filtered.filter(item => !item.is_archived)
  }

  return filtered
}

// When discussion is created, append it to the selected parent topic
function appendDiscussionToTopic(discussion: Tables<'discussions'>) {
  const topic = topics.value.find(topic => topic.id === discussion.discussion_topic_id)
  if (topic) {
    topic.discussions.push(discussion)
  }
}

// Auto-scroll to the top of the page whenever nested topic is changed
watch(activeTopicId, () => window.scrollTo(0, 0))

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
    const parentTopic = topics.value.find(topic =>
      topic.discussions.some(discussion => discussion.id === data.id),
    )
    if (parentTopic) {
      const discussionIndex = parentTopic.discussions.findIndex(({ id }) => id === data.id)
      const oldDiscussion = parentTopic.discussions[discussionIndex]
      parentTopic.discussions[discussionIndex] = { ...oldDiscussion, ...data } as ForumDiscussion
    }
  }
}

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
  }
}

const visibleDiscussionIds = computed(() => {
  return new Set(
    topics.value
      .filter(topic => settings.value.show_forum_archived || !topic.is_archived)
      .flatMap(topic => topic.discussions)
      .filter(discussion => settings.value.show_forum_archived || !discussion.is_archived)
      .filter(discussion => settings.value.show_nsfw_content || !discussion.is_nsfw)
      .map(discussion => discussion.id),
  )
})

const discussionLookup = computed(() => {
  const lookup = new Map<string, ForumDiscussion>()

  topics.value.forEach((topic) => {
    topic.discussions.forEach((discussion) => {
      lookup.set(discussion.id, discussion)
    })
  })

  return lookup
})

// Filters the raw userActivity list reactively so toggling show_nsfw_content
// immediately hides NSFW discussions from the "Recently visited" section.
// discussionLookup already contains is_nsfw from the topics fetch.
const visibleUserActivity = computed(() => {
  if (settings.value.show_nsfw_content)
    return userActivity.value

  return userActivity.value.filter((item) => {
    const discussion = discussionLookup.value.get(item.discussionId)
    return !discussion?.is_nsfw
  })
})

const visibleReplies = computed<ActivityItem[]>(() => {
  return latestReplies.value
    .filter((reply) => {
      if (!reply.discussionId)
        return false

      if (!settings.value.show_nsfw_content) {
        // Hide reply if the reply itself is NSFW
        if (reply.isNsfw)
          return false
        // Hide reply if its parent discussion is NSFW
        const discussion = discussionLookup.value.get(reply.discussionId)
        if (discussion?.is_nsfw)
          return false
      }

      return visibleDiscussionIds.value.has(reply.discussionId)
    })
    .map((reply) => {
      const discussion = reply.discussionId ? discussionLookup.value.get(reply.discussionId) : null

      return {
        ...reply,
        type: 'Reply',
        typeLabel: 'Reply in',
        typeContext: discussion?.title ?? 'Discussion',
        title: reply.description ?? 'Reply',
        description: undefined,
        href: `/forum/${discussion?.slug ?? reply.discussionId}?comment=${reply.id}`,
      }
    })
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

const latestPosts = computed<ActivityItem[]>(() => {
  const flattenedTopics = topics.value
    .flatMap(topic => [topic, ...topic.discussions])
    .filter((item) => {
      if (!settings.value.show_nsfw_content && 'is_nsfw' in item && item.is_nsfw)
        return false
      if (settings.value.show_forum_archived)
        return true
      if ('discussion_topic_id' in item && item.discussion_topic_id && hiddenTopicIds.value.has(item.discussion_topic_id))
        return false
      return !item.is_archived
    })
    .map((item) => {
      const isTopic = !('discussion_topic_id' in item)
      const id = item.id
      const title = (isTopic ? item.name : item.title) ?? (isTopic ? 'Topic' : 'Discussion')

      return {
        id,
        type: isTopic ? 'Topic' : 'Discussion',
        title,
        description: item.description ?? undefined,
        timestamp: `${dayjs(item.created_at).fromNow()}`,
        timestampRaw: item.created_at,
        user: item.created_by,
        icon: isTopic ? 'ph:folder-open' : 'ph:scroll',
        isArchived: item.is_archived,
        ...(isTopic
          ? { onClick: () => setActiveTopicById(id) }
          : { href: `/forum/${(item as ForumDiscussion).slug ?? id}` }),
      } as ActivityItem
    })

  return [...flattenedTopics, ...visibleReplies.value]
    .toSorted((a, b) => {
      const ta = new Date(a.timestampRaw).getTime()
      const tb = new Date(b.timestampRaw).getTime()
      return ta > tb ? -1 : ta < tb ? 1 : 0
    })
    .slice(0, 20)
})

const latestPostMentionIds = computed(() => {
  const ids = new Set<string>()

  latestPosts.value.forEach((post) => {
    const text = post.description ?? post.title
    extractMentionIds(text ?? '').forEach(id => ids.add(id))
  })

  return [...ids]
})

const { users: mentionUsers } = useBulkUserData(latestPostMentionIds, {
  includeAvatar: false,
  includeRole: false,
})

const mentionLookup = computed<Record<string, string>>(() => {
  const lookup: Record<string, string> = {}

  for (const [id, user] of mentionUsers.value.entries()) {
    if (user?.username) {
      lookup[id] = user.username
    }
  }

  return lookup
})

const postSinceYesterday = computed(() => {
  const now = dayjs()
  return latestPosts.value
    .filter(item => dayjs(item.timestampRaw).isAfter(now.subtract(24, 'hour')))
    .length
})

// Draft count for creation dropdown
const draftCount = ref<number>(0)

function fetchDraftCount() {
  supabase
    .from('discussions')
    .select('*', { count: 'exact', head: true })
    .eq('created_by', userId.value)
    .eq('is_draft', true)
    .then(({ count }) => {
      if (count !== null) {
        draftCount.value = count
      }
    })
}

onBeforeMount(() => {
  fetchDraftCount()
})

// Shortcut to open search
useEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
    event.preventDefault()
    searchOpen.value = true
  }
})

const isMac = import.meta.client && /Mac/i.test(navigator.platform)

function handleBreadcrumbMiddleClick(path: string = '/forum') {
  window.open(path, '_blank')
}
</script>

<template>
  <div class="page forum">
    <ClientOnly>
      <section class="page-title mb-xl">
        <h1>
          Forum
        </h1>
        <p>
          Bringing back the old school internet experience
        </p>
      </section>

      <section v-if="settings.show_forum_updates" class="forum__latest">
        <Flex y-center x-start expand class="mb-s">
          <h5>
            Latest updates
          </h5>
          <Badge v-if="postSinceYesterday" variant="accent">
            {{ postSinceYesterday }} today
          </Badge>
        </Flex>

        <div class="forum__latest-list">
          <template v-if="loading">
            <div v-for="item in 4" :key="item" class="forum__latest-item">
              <Flex x-between y-center expand>
                <Flex :gap="4" y-center>
                  <Skeleton width="96px" height="15px" />
                  <Skeleton width="64px" height="15px" />
                </Flex>
                <Skeleton width="40px" height="15px" />
              </Flex>
              <Skeleton class="forum__latest-title" width="45%" height="20px" />
              <Skeleton v-if="item < 3" class="forum__latest-description" width="80%" height="15px" />
              <Flex y-center x-start expand class="forum__latest-footer">
                <Skeleton circle width="28px" height="28px" />
                <Skeleton width="80px" height="16px" />
              </Flex>
            </div>
          </template>

          <template v-else>
            <NuxtLink v-for="post in latestPosts" :key="post.id" class="forum__latest-item" :href="post.href" @click.exact="post.onClick ? ($event.preventDefault(), post.onClick()) : undefined">
              <Flex x-between y-center expand>
                <Flex :gap="4" y-center>
                  <Icon :name="post.icon" :size="13" />
                  <span class="forum__latest-type">
                    <template v-if="post.type === 'Reply'">
                      {{ post.typeLabel }} <strong>{{ post.typeContext }}</strong>
                    </template>
                    <template v-else>
                      {{ post.typeLabel ?? post.type }}
                    </template>
                  </span>
                </Flex>
                <span class="forum__latest-timestamp">{{ post.timestamp }}</span>
              </Flex>
              <strong class="forum__latest-title">
                <MarkdownPreview v-if="post.type === 'Reply'" :markdown="post.title" :mention-lookup />
                <template v-else>{{ post.title }}</template>
              </strong>
              <p v-if="post.description" class="forum__latest-description">
                {{ stripMarkdown(processMentionsToText(post.description, mentionLookup)) }}
              </p>
              <Flex y-center x-between expand class="forum__latest-footer">
                <UserDisplay :user-id="post.user" size="s" show-role />
              </Flex>
            </NuxtLink>
          </template>
        </div>
      </section>

      <section v-if="settings.show_forum_recently_visited && userId && (userActivityLoading || visibleUserActivity.length > 0)" class="forum__continue">
        <h5 class="mb-s">
          Recently visited
        </h5>

        <Card>
          <ul v-if="userActivityLoading" class="forum__continue-list">
            <li v-for="item in 6" :key="item">
              <Skeleton :height="40" width="100%" />
            </li>
          </ul>

          <ul v-else-if="visibleUserActivity.length > 0" class="forum__continue-list">
            <li v-for="item in visibleUserActivity" :key="item.id">
              <NuxtLink :to="item.discussionHref" class="forum__continue-item">
                <TinyBadge class="ws-nowrap text-color-light">
                  <Icon :name="item.type === 'Reply' ? 'ph:chat-circle' : 'ph:scroll'" :size="16" />
                  {{ item.discussionTopicId ? topicLookup.get(item.discussionTopicId) ?? item.type : item.type }}
                </TinyBadge>
                <span class="forum__continue-title">{{ item.discussionTitle }}</span>
                <span class="forum__continue-time">{{ item.timestamp }}</span>
              </NuxtLink>
            </li>
          </ul>
        </Card>
      </section>

      <Flex x-start y-center class="mb-m" :gap="isMobile ? 'xxs' : 'xs'">
        <Button :disabled="!activeTopicId" size="s" :square="!isMobile" outline @click="setActiveTopicById(activeTopicPath.at(-2)?.parent_id ?? null)" @click.middle.prevent="() => {}">
          <template v-if="isMobile" #start>
            <Icon :name="!activeTopicId ? 'ph:house' : 'ph:arrow-left'" />
          </template>
          <Icon v-if="!isMobile" :name="!activeTopicId ? 'ph:house' : 'ph:arrow-left'" />
          <template v-if="isMobile">
            {{ !activeTopicId ? 'Frontpage' : "Back" }}
          </template>
        </Button>
        <Breadcrumbs v-if="!isMobile">
          <BreadcrumbItem
            @click="setActiveTopicById(null)"
            @mousedown.middle="handleBreadcrumbMiddleClick"
          >
            Frontpage
          </BreadcrumbItem>
          <BreadcrumbItem
            v-for="(item, index) in activeTopicPath"
            :key="item.parent_id"
            v-bind="index !== activeTopicPath.length - 1 ? {
              onClick: () => setActiveTopicById(item.parent_id),
              onMousedown: (event: MouseEvent) => {
                if (event.button === 1) {
                  event.preventDefault()
                  handleBreadcrumbMiddleClick(`/forum?activeTopicId=${item.parent_id}`)
                }
              },
            } : {}"
          >
            {{ item.title }}
          </BreadcrumbItem>
        </Breadcrumbs>

        <div class="flex-1" />

        <!-- Only allow creating things for signed in users -->
        <Flex :gap="isMobile ? 'xxs' : 'xs'">
          <template v-if="user">
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

          <Tooltip :delay="1000">
            <Button size="s" :square="isMobile" @click="searchOpen = true">
              <template v-if="!isMobile" #start>
                <Icon name="ph:magnifying-glass" :size="16" />
              </template>
              <template v-if="isMobile">
                <Icon name="ph:magnifying-glass" :size="16" />
              </template>
              {{ isMobile ? '' : 'Search' }}
            </Button>

            <template #tooltip>
              <p>
                Keyboard shortcut: <KbdGroup>
                  <Kbd :keys="isMac ? '⌘' : 'Ctrl'" class="mr-xxs" />
                  <Kbd keys="K" />
                </KbdGroup>
              </p>
            </template>
          </Tooltip>

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
              <Switch v-model="settings.show_forum_updates" label="Show latest updates" />
              <Switch v-model="settings.show_forum_recently_visited" label="Show recently visited" />
              <Switch v-model="settings.show_forum_archived" label="Show archived topics & discussions" />
              <Switch v-model="settings.show_forum_unread_bubbles" label="Show unread bubbles" />
              <!-- <Switch v-model="settings.showNsfw" label="Show NSFW in latest updates" /> -->
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
          <Skeleton width="49px" height="16px" />
        </div>

        <ul>
          <li v-for="item in 6" :key="item" class="forum__category-post" style="height:71.3px">
            <div class="forum__category-post--item">
              <Skeleton width="40px" height="40px" />

              <div class="forum__category-post--name">
                <Skeleton width="128px" height="20px" class="mb-xs" />
                <Skeleton width="242px" height="18px" />
              </div>

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
              <span>Discussions / Replies</span>
              <span>Views</span>
              <span>Last activity</span>
            </template>
            <template v-else>
              <div />
              <div />
              <div />
            </template>
            <ForumItemActions table="discussion_topics" :data="topic" @update="replaceItemData('topic', $event)" @remove="removeItem('topic', $event)" />
          </div>

          <ul v-if="topic.discussions.length > 0 || getTopicsByParentId(topic.id).length > 0">
            <ForumTopicItem
              v-for="subtopic of getTopicsByParentId(topic.id)"
              :key="subtopic.id"
              :data="subtopic"
              :href="`/forum?${subtopic.slug ? `activeTopic=${subtopic.slug}` : `activeTopicId=${subtopic.id}`}`"
              :last-activity="subtopic.last_activity_at"
              :discussion-count="subtopic.discussions.length"
              :reply-count="subtopic.total_reply_count"
              :view-count="subtopic.total_view_count"
              :has-new="settings.show_forum_unread_bubbles && forumUnread.isTopicNew(subtopic.id, subtopic.discussions.length, subtopic.total_reply_count ?? 0)"
              @click="setActiveTopicFromTopic(subtopic)"
              @update="replaceItemData('topic', $event)"
              @remove="removeItem('topic', $event)"
            />

            <ForumDiscussionItem
              v-for="discussion of sortDiscussions(topic.discussions)"
              :key="discussion.id"
              :data="discussion"
              :last-activity="discussion.last_activity_at"
              :has-new="settings.show_forum_unread_bubbles && forumUnread.isDiscussionNew(discussion.id, discussion.reply_count ?? 0)"
              @click="forumUnread.markDiscussionSeen(discussion.id, discussion.reply_count ?? 0)"
              @update="replaceItemData('discussion', $event)"
              @remove="removeItem('discussion', $event)"
            />
          </ul>
          <div v-else class="forum__category-empty">
            <p>There are no discussions in this topic</p>
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
        @close="addingDiscussion = false"
        @created="appendDiscussionToTopic"
        @draft-updated="fetchDraftCount()"
      />

      <Commands
        :open="searchOpen"
        :commands="searchResults"
        placeholder="Find a forum post..."
        @close="searchOpen = false"
      />
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
  &__continue {
    margin-bottom: var(--space-xl);
    // background-color: var(--card-bg);

    .vui-card .vui-card-content {
      padding: var(--space-xs);
    }
  }

  &__continue-loading {
    font-size: var(--font-size-s);
    color: var(--color-text-lighter);

    .spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }
  }

  &__continue-list {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-xs);
    column-gap: var(--space-m);
    list-style: none;
  }

  &__continue-item {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs);
    border-radius: var(--border-radius-m);
    text-decoration: none;

    &:hover {
      background-color: var(--color-bg-medium);
    }
  }

  &__continue-title {
    font-size: var(--font-size-s);
    color: var(--color-text);
    @include line-clamp(1);
    flex: 1;
  }

  &__continue-time {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    white-space: nowrap;
  }

  &__latest {
    margin-bottom: var(--space-s);

    & > strong {
      font-size: var(--text-size-s);
      font-weight: var(--font-weight-bold);
    }
  }

  &__latest-list {
    display: flex;
    gap: var(--space-s);
    overflow-x: auto;
    padding-bottom: 16px;
    scrollbar-width: thin;
    margin-bottom: var(--space-l);

    .forum__latest-item {
      display: inline-flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-xs);
      padding: var(--space-s);
      border-radius: var(--border-radius-m);
      border: 1px solid var(--color-border);
      min-width: 0;
      overflow: hidden;
      cursor: pointer;

      &:first-child {
        background-color: var(--color-bg-medium);

        &:hover {
          background-color: var(--color-bg-raised);
        }
      }

      &:hover {
        background-color: var(--color-bg-medium);
      }

      & > .vui-flex {
        width: 100%;
        max-width: 100%;
        min-width: 0;
        overflow: hidden;
      }

      & > .vui-flex > .vui-flex {
        flex: 1;
        min-width: 0;
        overflow: hidden;
      }

      span {
        white-space: nowrap;
        font-size: var(--font-size-xs);
        color: var(--color-text-lighter);
        line-height: 1.2;
      }

      .forum__latest-type {
        flex: 1;
        min-width: 0;
        display: block;
        max-width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;

        strong {
          font-size: var(--font-size-s);
          font-weight: var(--font-weight-bold);
        }
      }

      .forum__latest-title {
        display: block;
        width: 100%;
        max-width: 100%;
        text-align: left;
        font-size: var(--font-size-m);
        color: var(--color-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-top: 2px;
        line-height: 1.2;

        p {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }

      .forum__latest-description {
        @include line-clamp(1);
        text-align: left;
        font-size: var(--font-size-s);
        color: var(--color-text-lighter);
        margin-top: 2px;
        margin-bottom: var(--space-s);
        line-height: 1.3;
      }

      .forum__latest-footer {
        width: 100%;
        margin-top: auto;
      }

      .forum__latest-timestamp {
        font-size: var(--font-size-xs);
        color: var(--color-text-lighter);
      }
    }
  }

  .forum__latest-list .forum__latest-item {
    width: 320px;
    min-width: 320px;
    max-width: 320px;
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
  }

  &__category-post {
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

    .forum__category-post--meta span {
      font-size: var(--font-size-s);
      color: var(--color-text-light);
      text-align: center;
      display: block;
    }
  }

  &__category-post--icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 16px;
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
      border-radius: 50%;
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

  &__category-empty {
    padding: var(--space-m);
    font-size: var(--font-size-m);
    color: var(--color-text-light);
  }

  &__item-actions {
    display: none;
  }
}

@media screen and (max-width: $breakpoint-m) {
  .forum__continue-list {
    grid-template-columns: repeat(2, 1fr);
  }

  .forum__category-title,
  .forum__category-post .forum__category-post--item {
    grid-template-columns: 40px 5fr 1fr 24px;
  }

  .forum__category-title > span,
  .forum__category-title > div {
    white-space: nowrap;
    font-size: var(--font-size-xs);

    &:nth-child(2),
    &:nth-child(3) {
      display: none;
    }
  }

  .forum__category-post .forum__category-post--item .forum__category-post--meta {
    span {
      white-space: nowrap;
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
  }

  .forum__category-post--icon {
    width: 32px;
    height: 32px;
    border-radius: 12px;
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

  .forum__latest-list .forum__latest-item > .vui-flex {
    min-width: 256px;
  }

  .forum__continue-list {
    grid-template-columns: 1fr;
  }
}
</style>
