<script setup lang="ts">
import type { Command } from '@dolanske/vui'
import type { Tables } from '@/types/database.types'
import { BreadcrumbItem, Breadcrumbs, Button, Card, Commands, Dropdown, DropdownItem, Flex } from '@dolanske/vui'
import { useRouteQuery } from '@vueuse/router'
import dayjs from 'dayjs'
import ForumDiscussionItem from '@/components/Forum/ForumDiscussionItem.vue'
import ForumModalAddDiscussion from '@/components/Forum/ForumModalAddDiscussion.vue'
import ForumModalAddTopic from '@/components/Forum/ForumModalAddTopic.vue'
import { composedPathToString, composePathToTopic } from '@/lib/topics'

useSeoMeta({
  title: 'Forum',
  description: 'Forum description TBA',
  ogTitle: 'Forum',
  ogDescription: 'Forum description TBA',
})

// TODO: admins should be able to right click delete, lock, archive any topic or discussion

export type TopicWithDiscussions = Tables<'discussion_topics'> & {
  discussions: Tables<'discussions'>[]
}

const userId = useUserId()

const { user } = useCacheUserData(userId, { includeRole: true })

const addingTopic = ref(false)
const addingDiscussion = ref(false)

const loading = ref(false)
const supabase = useSupabaseClient()

const topicsError = ref<string | null>(null)
const topics = ref<TopicWithDiscussions[]>([])

onBeforeMount(() => {
  loading.value = true
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

      loading.value = false
    })
})

// Pathing and topic nesting
// const activeTopicId = ref<string | null>(null)
const activeTopicId = useRouteQuery<string | null>('activeTopicId', null)

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
  if (!activeTopicId.value) {
    return topics.value.filter(topic => topic.parent_id === null)
  }
  else {
    return topics.value.filter(topic => topic.parent_id === activeTopicId.value)
  }
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
          <h3>{{ topic.name }}</h3>
          <template v-if="index === 0">
            <span>Replies</span>
            <span>Views</span>
            <span>Last update</span>
          </template>
        </div>

        <ul v-if="topic.discussions.length > 0 || getTopicsByParentId(topic.id).length > 0">
          <ForumTopicItem
            v-for="subtopic of getTopicsByParentId(topic.id)"
            :key="subtopic.id"
            :data="subtopic"
            @click="activeTopicId = topic.id"
          />

          <ForumDiscussionItem
            v-for="discussion of sortDiscussions(topic.discussions)"
            :key="discussion.id"
            :data="discussion"
          />
        </ul>
        <div v-else class="forum__category-empty">
          <p>There are no discussions in this topic</p>
        </div>
      </Card>

      <ForumModalAddTopic
        :open="addingTopic"
        :topics="topics"
        :active-topic="activeTopicId"
        @close="addingTopic = false"
        @created="(topic) => topics.push(topic)"
      />

      <ForumModalAddDiscussion
        :open="addingDiscussion"
        :topics="topics"
        :active-topic="activeTopicId"
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
.forum {
  &__category {
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
    grid-template-columns: 40px 5fr repeat(3, 1fr) 24px;
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

      &--meta span {
        font-size: var(--font-size-m);
        color: var(--color-text-lighter);
      }

      &--name {
        strong {
          display: flex;
          gap: 4px;
          align-items: center;
        }
      }
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
</style>
