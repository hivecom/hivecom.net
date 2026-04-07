<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Button, Card, Dropdown, DropdownItem, Flex, Kbd, KbdGroup, Popout, Skeleton, Switch, Tooltip } from '@dolanske/vui'
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
import { useCache } from '@/composables/useCache'
import { useContentRulesAgreement } from '@/composables/useContentRulesAgreement'
import { useBulkDataUser, useDataUser } from '@/composables/useDataUser'
import { useDiscussionCache } from '@/composables/useDiscussionCache'
import { useForumActivityFeed } from '@/composables/useForumActivityFeed'
import { useForumDraftCount } from '@/composables/useForumDraftCount'
import { useForumUserActivity } from '@/composables/useForumUserActivity'
import { useBulkTopicIcons } from '@/composables/useTopicIcon'
import { useBreakpoint } from '@/lib/mediaQuery'
import { composePathToTopic } from '@/lib/topics'
import { slugify } from '@/lib/utils/formatting'

dayjs.extend(relativeTime)

const FORUM_TOPICS_CACHE_KEY = 'forum:topics-with-discussions'
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
}

// Show display settings & store them in localStorage
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
const rulesModalOpen = ref(false)
const contentRulesGateOpen = ref(false)
const { agreed: agreedContentRules, loading: contentRulesLoading, markAgreed } = useContentRulesAgreement()
const pendingCreateAction = ref<'discussion' | 'topic' | null>(null)

const { settings } = useDataUserSettings()

const loading = ref(false)
const supabase = useSupabaseClient()
const forumCache = useCache()
const discussionCache = useDiscussionCache()

watch(contentRulesGateOpen, (open) => {
  if (!open)
    pendingCreateAction.value = null
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

onMounted(() => {
  lastFeedVisitedAt.value = forumUnread.recordFeedVisit()
})

const {
  latestPosts,
  latestPostMentionIds,
  latestPostAuthorIds,
  postSinceYesterday,
  fetchLatestReplies,
} = useForumActivityFeed({
  topics,
  settings,
  discussionLookup,
  visibleDiscussionIds,
  hiddenTopicIds,
  onTopicClick: (id: string) => setActiveTopicById(id),
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
  loading.value = true

  // ── Topics + nested discussions ──────────────────────────────────────────
  // Cache for 5 minutes. New discussions and reply counts change frequently
  // enough that a short TTL is appropriate, but remounting within a session
  // (back navigation) should never refetch.
  const cachedTopics = forumCache.get<TopicWithDiscussions[]>(FORUM_TOPICS_CACHE_KEY)

  if (cachedTopics !== null) {
    topics.value = cachedTopics
    forumUnread.initializeTopics(cachedTopics)

    if (activeTopicSlug.value) {
      const matched = cachedTopics.find(t => t.slug === activeTopicSlug.value)
      if (matched)
        activeTopicId.value = matched.id
    }
    else if (activeTopicIdQuery.value) {
      const matched = cachedTopics.find(t => t.id === activeTopicIdQuery.value)
      if (matched) {
        activeTopicId.value = matched.id
        if (matched.slug)
          _setQuery(matched.slug, null, false)
      }
    }
  }
  else {
    await supabase
      .from('discussion_topics')
      .select('*, discussions(id, title, slug, description, is_sticky, is_locked, is_archived, is_draft, is_nsfw, reply_count, view_count, last_activity_at, created_at, created_by, modified_at, modified_by, discussion_topic_id, pinned_reply_id)')
      .neq('discussions.is_draft', true)
      .then(({ data, error }) => {
        if (error) {
          topicsError.value = error.message
        }
        else {
          topics.value = data
          forumCache.set(FORUM_TOPICS_CACHE_KEY, data, FORUM_TOPICS_TTL)

          // Warm the per-discussion cache so navigating into forum/[id].vue is a
          // cache hit within the TTL window. The topics query fetches a projection
          // (not the full row), but it's enough for Discussion.vue's base-row needs.
          for (const topic of data) {
            for (const discussion of topic.discussions) {
              discussionCache.set(discussion)
            }
          }

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
      })
  }

  // ── Latest replies ───────────────────────────────────────────────────────
  await fetchLatestReplies()

  loading.value = false
})

const activeTopicPath = computed(() => composePathToTopic(activeTopicId.value, topics.value))

const breadcrumbItems = computed(() =>
  activeTopicPath.value.map((item, index) => ({
    id: item.parent_id,
    label: item.title,
    onClick: index !== activeTopicPath.value.length - 1
      ? () => setActiveTopicById(item.parent_id)
      : undefined,
    onMiddleClick: index !== activeTopicPath.value.length - 1
      ? () => handleBreadcrumbMiddleClick(`/forum?activeTopicId=${item.parent_id}`)
      : undefined,
  })),
)

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
const { openCommand } = useCommand()

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
  return filtered.toSorted(sortTopicsByPriority)
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
  const topic = topics.value.find(topic => topic.id === discussion.discussion_topic_id)
  if (topic) {
    topic.discussions.push(discussion)
    // Bust the topics cache so the next full remount picks up the new discussion.
    forumCache.delete(FORUM_TOPICS_CACHE_KEY)
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
  forumCache.delete(FORUM_TOPICS_CACHE_KEY)
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
  // Bust cache so remounts reflect the deletion.
  forumCache.delete(FORUM_TOPICS_CACHE_KEY)
}

onBeforeMount(() => {
  fetchDraftCount()
})

const isMac = import.meta.client && /Mac/i.test(navigator.platform)

function handleBreadcrumbMiddleClick(path: string = '/forum') {
  window.open(path, '_blank')
}
</script>

<template>
  <div class="page forum">
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
            <Button size="s" :square="isMobile" @click="openCommand(['discussion_topic', 'discussion'])">
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
              :has-new="settings.show_forum_unread_bubbles && forumUnread.isTopicNew(subtopic.id, subtopic.discussions.length, subtopic.total_reply_count ?? 0, subtopic.discussions)"
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

h5 {
  font-weight: var(--font-weight-medium);
  color: var(--color-text-light);
}

.forum {
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
}
</style>
