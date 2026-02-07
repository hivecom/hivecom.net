<script setup lang="ts">
import type { Command } from '@dolanske/vui'
import type { Tables } from '@/types/database.types'
import { BreadcrumbItem, Breadcrumbs, Button, Card, Commands, Dropdown, DropdownItem, Flex } from '@dolanske/vui'
import { useRouteQuery } from '@vueuse/router'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import ForumDiscussionItem from '@/components/Forum/ForumDiscussionItem.vue'
import ForumItemActions from '@/components/Forum/ForumItemActions.vue'
import ForumModalAddDiscussion from '@/components/Forum/ForumModalAddDiscussion.vue'
import ForumModalAddTopic from '@/components/Forum/ForumModalAddTopic.vue'
import BadgeCircle from '@/components/Shared/BadgeCircle.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
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
  type: 'topic' | 'discussion' | 'reply'
  content: string
  timestamp: string
  user: string
  href?: string
  onClick?: () => void
  icon: string
}

const userId = useUserId()

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
              type: 'reply',
              icon: 'ph:chats-circle',
              content: item.content,
              timestamp: item.modified_at,
              user: item.modified_by!,
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

    const discussionResults: Command[] = topic.discussions.map((discussion, index) => ({
      title: discussion.title ?? `Discussion ${index + 1}`,
      group: 'Discussions',
      description: discussion.description ?? undefined,
      handler: () => {
        router.push(`/forum/${discussion.id}`)
        searchOpen.value = false
      },
    }))

    return [topicItem, ...discussionResults]
  })
})

// Sort results by most recently modified and by sticky (pinned)
function sortDiscussions(discussions: Tables<'discussions'>[]) {
  return discussions.sort((a, b) => {
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
  let filtered
  if (!activeTopicId.value) {
    filtered = topics.value.filter(topic => topic.parent_id === null)
  }
  else {
    filtered = topics.value.filter(topic => topic.parent_id === activeTopicId.value)
  }

  // Sort topics to prioritize `sort_order` and the rest is sorted
  // alphabetically below. Only manually-created topics should have a sort_order
  return filtered.toSorted((a, b) => {
    const aHasOrder = a.sort_order !== 0
    const bHasOrder = b.sort_order !== 0

    if (aHasOrder && bHasOrder) {
      if (a.sort_order === b.sort_order) {
        return a.name.localeCompare(b.name)
      }
      return b.sort_order - a.sort_order
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
  return topics.value.filter(topic => topic.parent_id === parentId)
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

// NOTE: could compare timestamp and lists the `type` with a "new" or "updated" labels
const latestPosts = computed<ActivityItem[]>(() => {
  const flattenedTopics = topics.value
    .flatMap(topic => [topic, ...topic.discussions])
    .filter(item => item.description)
    .map((item) => {
      const isTopic = 'slug' in item
      const id = item.id

      return {
        id,
        type: isTopic ? 'topic' : 'discussion',
        // @ts-expect-error different objects might have fields undefined
        content: (isTopic ? item.name : item.title) ?? 'Content',
        timestamp: item.modified_at,
        user: item.modified_by,
        icon: isTopic ? 'ph:folder-open' : 'ph:scroll',
        ...(isTopic
          ? { onClick: () => activeTopicId.value = id }
          : { href: `/forum/${id}` }),
      } as ActivityItem
    })

  return flattenedTopics
    .concat(latestReplies.value)
    .toSorted((a, b) => new Date(a.timestamp) > new Date(b.timestamp) ? -1 : 1)
    .splice(0, 10)
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

      <section class="forum__latest">
        <h4 class="mb-m">
          Latest activity
        </h4>

        <div class="forum__latest-list">
          <NuxtLink v-for="event in latestPosts" :key="event.id" class="forum__latest-item" :href="event.href" @click="event.onClick">
            <Flex x-between y-center>
              <Flex :gap="4">
                <Icon :name="event.icon" :size="13" />
                <span> {{ event.type }}</span>
              </Flex>
              <span>{{ dayjs(event.timestamp).fromNow() }}</span>
            </Flex>
            <p>{{ event.content }}</p>
            <UserDisplay :user-id="event.user" size="s" />
          </NuxtLink>
        </div>
      </section>

      <Flex x-between y-center class="mb-m">
        <Breadcrumbs>
          <BreadcrumbItem @click="activeTopicId = null">
            Frontpage
          </BreadcrumbItem>
          <BreadcrumbItem
            v-for="(item, index) in activeTopicPath"
            :key="item.parent_id"
            v-bind="index !== activeTopicPath.length - 1 || activeTopicPath.length > 1 ? { onClick: () => activeTopicId = item.parent_id } : {}"
          >
            {{ item.title }}
          </BreadcrumbItem>
        </Breadcrumbs>

        <!-- Only allow creating things for signed in users -->
        <Flex v-if="user" gap="s">
          <Dropdown v-if="user.role === 'admin' || user.role === 'moderator'">
            <template #trigger="{ toggle }">
              <Button size="s" variant="accent" @click="toggle">
                <template #start>
                  <Icon name="ph:plus" :size="16" />
                </template>
                Create
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
          <Button v-else variant="accent" size="s" @click="addingDiscussion = true">
            <template #start>
              <Icon name="ph:plus" :size="16" />
            </template>
            Discussion
          </Button>

          <Button size="s" @click="searchOpen = true">
            <template #start>
              <Icon name="ph:magnifying-glass" :size="16" />
            </template>
            Search
          </Button>
        </Flex>
      </Flex>

      <Card v-for="(topic, index) in modelledTopics" :key="topic.id" class="forum__category" separators>
        <div class="forum__category-title">
          <h3 :id="slugify(topic.name)">
            {{ topic.name }}
            <BadgeCircle v-if="topic.is_locked" variant="accent" data-title-top="Locked">
              <Icon name="ph:lock" class="text-color-accent" />
            </BadgeCircle>

            <BadgeCircle v-if="topic.is_archived" variant="warning" data-title-top="Archived">
              <Icon name="ph:archive" class="text-color-yellow" />
            </BadgeCircle>
          </h3>
          <template v-if="index === 0">
            <span>Replies</span>
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
            @click="activeTopicId = topic.id"
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

.forum {
  &__latest {
    margin-bottom: var(--space-xl);
    padding-right: 32px;

    & > strong {
      font-size: var(--font-size-l);
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
        min-width: 292px;
      }

      span {
        white-space: nowrap;
        font-size: var(--font-size-xs);
        color: var(--color-text-lighter);

        &:first-child {
          text-transform: capitalize;
        }
      }

      p {
        @include line-clamp(1);
        text-align: left;
        flex: 1;
        font-size: var(--font-size-m);
        color: var(--color-text);
        margin-top: 2px;
        margin-bottom: var(--space-s);
      }
    }
  }

  &__category {
    background-color: var(--color-bg-medium);

    h3 {
      height: 28px;
      line-height: 28px;
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
    grid-template-columns: 40px 5fr 64px 64px 128px 24px;
    align-items: center;
    gap: var(--space-s);
    padding: var(--space-s) var(--space-m);
  }

  &__category-title {
    padding-block: var(--space-s);
    align-items: center;
    border-bottom: 1px solid var(--color-border);

    h3 {
      font-size: var(--font-size-xl);
      grid-column: 1 / 3;
    }

    span {
      font-size: var(--font-size-s);
      color: var(--color-text-light);
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

      &--meta &--name {
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
