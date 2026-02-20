<script setup lang="ts">
import type { Command } from '@dolanske/vui'
import type { Tables } from '@/types/database.types'
import { Badge, BreadcrumbItem, Breadcrumbs, Button, Card, Commands, Dropdown, DropdownItem, Flex, Popout, Switch } from '@dolanske/vui'
import { useStorage as useLocalStorage } from '@vueuse/core'
import { useRouteQuery } from '@vueuse/router'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import ForumDiscussionItem from '@/components/Forum/ForumDiscussionItem.vue'
import ForumItemActions from '@/components/Forum/ForumItemActions.vue'
import ForumModalAddDiscussion from '@/components/Forum/ForumModalAddDiscussion.vue'
import ForumModalAddTopic from '@/components/Forum/ForumModalAddTopic.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import { extractMentionIds, processMentions, stripMarkdown } from '@/lib/markdown-processors'
import { useBreakpoint } from '@/lib/mediaQuery'
import { composedPathToString, composePathToTopic } from '@/lib/topics'
import { slugify } from '@/lib/utils/formatting'

dayjs.extend(relativeTime)

useSeoMeta({
  title: 'Forum',
  description: 'Forum description TBA',
  ogTitle: 'Forum',
  ogDescription: 'Forum description TBA',
})

export type TopicWithDiscussions = Tables<'discussion_topics'> & {
  discussions: Tables<'discussions'>[]
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
  icon: string
}

// Show display settings & store them in localStorage
const showSettings = ref(false)
const settingsAnchor = useTemplateRef('settings-anchor')

const settings = useLocalStorage('forum-settings', {
  showArchived: false,
  showActivity: true,
}, typeof window !== 'undefined' ? window.localStorage : undefined, {
  serializer: {
    read: value => value ? JSON.parse(value) : null,
    write: value => JSON.stringify(value),
  },
})

// Top level variable definitions
const userId = useUserId()
const isMobile = useBreakpoint('<s')

const { user } = useCacheUserData(userId, { includeRole: true })

const addingTopic = ref(false)
const addingDiscussion = ref(false)

const loading = ref(false)
const supabase = useSupabaseClient()

const topicsError = ref<string | null>(null)
const topics = ref<TopicWithDiscussions[]>([])

// Store 10 latest replies for the activity list
const latestReplies = ref<ActivityItem[]>([])

// Pathing and topic nesting
// const activeTopicId = ref<string | null>(null)
const activeTopicId = useRouteQuery<string | null>('activeTopicId', null)

// Provide topics and activeTopicId to child modals
provide('forumTopics', () => topics)
provide('forumActiveTopicId', () => activeTopicId)

onBeforeMount(() => {
  loading.value = true

  Promise.all([
    supabase
      .from('discussion_topics')
      .select(`
        *,
        discussions (
          *
        )
      `)
      .then(({ data, error }) => {
        if (error) {
          topicsError.value = error.message
        }
        else {
          topics.value = data
        }
      }),
    // FIXME: we need to limit discussion_replies only to discussion types
    // which can appear in the forum. No clue how to do that rn
    supabase
      .from('discussion_replies')
      .select('*')
      .limit(10)
      .order('created_at')
      .then(({ data }) => {
        if (data) {
          latestReplies.value = data.map((item) => {
            return {
              id: item.id,
              type: 'Reply',
              icon: 'ph:chats-circle',
              title: 'Reply',
              description: item.markdown,
              timestamp: `${item.created_at === item.modified_at ? 'Created' : 'Updated'} ${dayjs(item.modified_at).fromNow()}`,
              timestampRaw: item.modified_at,
              user: item.modified_by!,
              discussionId: item.discussion_id,
              href: `/forum/${item.discussion_id}?comment=${item.id}`,
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

// Search implementation
const searchOpen = ref(false)
const router = useRouter()

// Transform topics & discussions into a searchable list of commands. Grouped by topic & discussions
const searchResults = computed<Command[]>(() => {
  return topics.value.flatMap((topic, index) => {
    if (!settings.value.showArchived && topic.is_archived)
      return []

    const topicItem = {
      title: topic.name || `Topic ${index + 1}`,
      group: 'Topics',
      description: composedPathToString(composePathToTopic(topic.parent_id, topics.value)),
      handler: () => {
        activeTopicId.value = topic.parent_id
        searchOpen.value = false

        if (!topic.parent_id) {
          const el = document.querySelector(`#${slugify(topic.name)}`)
          el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      },
    }

    const discussionResults: Command[] = topic.discussions
      .filter(discussion => settings.value.showArchived || !discussion.is_archived)
      .map((discussion, index) => {
        const fallbackTitle = discussion.title ?? `Discussion ${index + 1}`

        return {
          title: discussion.is_archived ? `${fallbackTitle} (Archived)` : fallbackTitle,
          group: 'Discussions',
          description: discussion.description ?? undefined,
          handler: () => {
            router.push(`/forum/${discussion.id}`)
            searchOpen.value = false
          },
        }
      })

    return [topicItem, ...discussionResults]
  })
})

// Sort results by most recently modified and by sticky (pinned)
function sortDiscussions(discussions: Tables<'discussions'>[]) {
  const filtered = settings.value.showArchived
    ? discussions
    : discussions.filter(discussion => !discussion.is_archived)

  return filtered.slice().sort((a, b) => {
    if (a.is_sticky && !b.is_sticky)
      return -1
    if (!a.is_sticky && b.is_sticky)
      return 1

    return dayjs(b.modified_at).isAfter(dayjs(a.modified_at)) ? 1 : -1
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
        if (!settings.value.showArchived && topic.is_archived)
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
  if (!settings.value.showArchived) {
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
      parentTopic.discussions[discussionIndex] = data as Tables<'discussions'>
    }
  }
}

const visibleDiscussionIds = computed(() => {
  return new Set(
    topics.value
      .filter(topic => settings.value.showArchived || !topic.is_archived)
      .flatMap(topic => topic.discussions)
      .filter(discussion => settings.value.showArchived || !discussion.is_archived)
      .map(discussion => discussion.id),
  )
})

const discussionLookup = computed(() => {
  const lookup = new Map<string, Tables<'discussions'>>()

  topics.value.forEach((topic) => {
    topic.discussions.forEach((discussion) => {
      lookup.set(discussion.id, discussion)
    })
  })

  return lookup
})

const visibleReplies = computed<ActivityItem[]>(() => {
  return latestReplies.value
    .filter((reply) => {
      if (!reply.discussionId)
        return false

      return visibleDiscussionIds.value.has(reply.discussionId)
    })
    .map((reply) => {
      const discussion = reply.discussionId ? discussionLookup.value.get(reply.discussionId) : null

      return {
        ...reply,
        type: 'Reply',
        typeLabel: 'Reply to',
        typeContext: discussion?.title ?? 'Discussion',
        title: reply.description ?? 'Reply',
        description: undefined,
      }
    })
})

const hiddenTopicIds = computed(() => {
  if (settings.value.showArchived)
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
      if (settings.value.showArchived)
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
        timestamp: `${item.created_at === item.modified_at ? 'Created' : 'Updated'} ${dayjs(item.modified_at).fromNow()}`,
        timestampRaw: item.modified_at,
        user: item.created_by,
        icon: isTopic ? 'ph:folder-open' : 'ph:scroll',
        isArchived: item.is_archived,
        ...(isTopic
          ? { onClick: () => activeTopicId.value = id }
          : { href: `/forum/${id}` }),
      } as ActivityItem
    })

  return flattenedTopics
    .concat(visibleReplies.value)
    .toSorted((a, b) => new Date(a.timestamp) > new Date(b.timestamp) ? -1 : 1)
    .splice(0, 10)
})

const latestPostMentionIds = computed(() => {
  const ids = new Set<string>()

  latestPosts.value.forEach((post) => {
    const text = post.description ?? post.title
    extractMentionIds(text ?? '').forEach(id => ids.add(id))
  })

  return Array.from(ids)
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

      <section v-if="settings.showActivity" class="forum__latest">
        <Flex y-center x-start expand class="mb-s">
          <h5>
            Latest updates
          </h5>
          <Badge v-if="postSinceYesterday" variant="accent">
            {{ postSinceYesterday }} today
          </Badge>
        </Flex>

        <div class="forum__latest-list">
          <NuxtLink v-for="post in latestPosts" :key="post.id" class="forum__latest-item" :href="post.href" @click="post.onClick">
            <Flex x-between y-center>
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
                <Badge v-if="post.isArchived" variant="warning">
                  Archived
                </Badge>
              </Flex>
            </Flex>
            <strong class="forum__latest-title">
              {{ post.type === 'Reply' ? stripMarkdown(processMentions(post.title, mentionLookup)) : post.title }}
            </strong>
            <p v-if="post.description" class="forum__latest-description">
              {{ stripMarkdown(processMentions(post.description, mentionLookup)) }}
            </p>
            <Flex y-center x-between expand class="forum__latest-footer">
              <UserDisplay :user-id="post.user" size="s" />
              <span class="forum__latest-timestamp">{{ post.timestamp }}</span>
            </Flex>
          </NuxtLink>
        </div>
      </section>

      <Flex x-start y-center class="mb-m" :gap="isMobile ? 'xxs' : 'xs'">
        <Button :disabled="!activeTopicId" size="s" :square="!isMobile" outline @click="activeTopicId = activeTopicPath.at(-2)?.parent_id ?? null">
          <template v-if="isMobile" #start>
            <Icon :name="!activeTopicId ? 'ph:house' : 'ph:arrow-left'" />
          </template>
          <Icon v-if="!isMobile" :name="!activeTopicId ? 'ph:house' : 'ph:arrow-left'" />
          <template v-if="isMobile">
            {{ !activeTopicId ? 'Frontpage' : "Back" }}
          </template>
        </Button>
        <Breadcrumbs v-if="!isMobile">
          <BreadcrumbItem @click="activeTopicId = null">
            Frontpage
          </BreadcrumbItem>
          <BreadcrumbItem
            v-for="(item, index) in activeTopicPath"
            :key="item.parent_id"
            v-bind="index !== activeTopicPath.length - 1 ? {
              onClick: () => activeTopicId = item.parent_id,
            } : {}"
          >
            {{ item.title }}
          </BreadcrumbItem>
        </Breadcrumbs>

        <div class="flex-1" />

        <!-- Only allow creating things for signed in users -->
        <Flex v-if="user" :gap="isMobile ? 'xxs' : 'xs'">
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
            <DropdownItem size="s" @click="addingDiscussion = true">
              Discussion
            </DropdownItem>
            <DropdownItem size="s" @click="addingTopic = true">
              Topic
            </DropdownItem>
          </Dropdown>

          <!-- Non-admin or moderators can only create a discussion -->
          <Button v-else variant="accent" size="s" :square="isMobile" @click="addingDiscussion = true">
            <template v-if="!isMobile" #start>
              <Icon name="ph:plus" :size="16" />
            </template>
            <template v-if="isMobile">
              <Icon name="ph:plus" :size="16" />
            </template>
            {{ isMobile ? '' : 'Discussion' }}
          </Button>

          <Button size="s" :square="isMobile" @click="searchOpen = true">
            <template v-if="!isMobile" #start>
              <Icon name="ph:magnifying-glass" :size="16" />
            </template>
            <template v-if="isMobile">
              <Icon name="ph:magnifying-glass" :size="16" />
            </template>
            {{ isMobile ? '' : 'Search' }}
          </Button>

          <Button ref="settings-anchor" size="s" square @click="showSettings = !showSettings">
            <Icon name="ph:gear" />
          </Button>

          <Popout :visible="showSettings" :anchor="settingsAnchor" placement="bottom" @click-outside="showSettings = false">
            <Flex column class="p-m" gap="s">
              <span class="text-m mb-xs text-color-light">Display options</span>
              <Switch v-model="settings.showArchived" label="Show archived topics & discussions" />
              <Switch v-model="settings.showActivity" label="Show latest updates" />
            </Flex>
          </Popout>
        </Flex>
      </Flex>

      <Card v-for="(topic, index) in modelledTopics" :key="topic.id" class="forum__category" separators>
        <div class="forum__category-title">
          <Flex y-center>
            <h3
              :id="slugify(topic.name)"
              class="forum__category-title-button"
              role="button"
              tabindex="0"
              @click="activeTopicId = topic.id"
              @keydown.enter="activeTopicId = topic.id"
            >
              {{ topic.name }}
            </h3>
            <Badge v-if="topic.is_locked" variant="info">
              <Icon name="ph:lock" class="text-color-blue" />
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
            <span>Last update</span>
          </template>
          <template v-else>
            <div />
            <div />
            <div />
          </template>
          <ForumItemActions table="discussion_topics" :data="topic" @update="replaceItemData('topic', $event)" />
        </div>

        <ul v-if="topic.discussions.length > 0 || getTopicsByParentId(topic.id).length > 0">
          <ForumTopicItem
            v-for="subtopic of getTopicsByParentId(topic.id)"
            :key="subtopic.id"
            :data="subtopic"
            :discussion-count="subtopic.discussions.length"
            @click="activeTopicId = subtopic.id"
            @update="replaceItemData('topic', $event)"
          />

          <ForumDiscussionItem
            v-for="discussion of sortDiscussions(topic.discussions)"
            :key="discussion.id"
            :data="discussion"
            @update="replaceItemData('discussion', $event)"
          />
        </ul>
        <div v-else class="forum__category-empty">
          <p>There are no discussions in this topic</p>
        </div>
      </Card>

      <ForumModalAddTopic
        :open="addingTopic"
        @close="addingTopic = false"
        @created="(topic) => topics.push(topic)"
      />

      <ForumModalAddDiscussion
        :open="addingDiscussion"
        @close="addingDiscussion = false"
        @created="appendDiscussionToTopic"
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

:root.light .forum__category-post.pinned {
  background-color: color-mix(in srgb, var(--color-accent) 30%, transparent) !important;
}

.forum {
  &__latest {
    margin-bottom: var(--space-xl);

    & > strong {
      font-size: var(--text-size-s);
      font-weight: var(--font-weight-bold);
    }
  }

  &__latest-list {
    display: flex;
    gap: var(--space-s);
    overflow-y: auto;
    padding-bottom: 16px;
    scrollbar-width: thin;

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

        &:first-child {
          text-transform: capitalize;
        }
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
      }

      .forum__latest-description {
        @include line-clamp(1);
        text-align: left;
        font-size: var(--font-size-s);
        color: var(--color-text-lighter);
        margin-top: 2px;
        margin-bottom: var(--space-s);
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
      background-color: color-mix(in srgb, var(--color-accent) 15%, transparent) !important;

      .forum__category-post--icon {
        background-color: var(--color-accent);
        border-color: var(--color-accent);

        .iconify {
          color: var(--color-text-invert);
        }
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

      &.topic {
        .forum__category-post--icon {
          border: none;
        }
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

    .iconify {
      color: var(--color-accent);
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
}
</style>
