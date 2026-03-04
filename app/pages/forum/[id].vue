<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Badge, BreadcrumbItem, Breadcrumbs, Button, Card, Flex, pushToast, Spinner, Tooltip } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import Discussion from '@/components/Discussions/Discussion.vue'
import ForumItemActions from '@/components/Forum/ForumItemActions.vue'
import Reactions from '@/components/Reactions/Reactions.vue'
import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import { stripMarkdown } from '@/lib/markdown-processors'
import { useBreakpoint } from '@/lib/mediaQuery'
import { formatDate } from '@/lib/utils/date'

dayjs.extend(relativeTime)

type DiscussionWithContext = Tables<'discussions'> & {
  profile?: Pick<Tables<'profiles'>, 'id' | 'username'> | null
  project?: Pick<Tables<'projects'>, 'id' | 'title'> | null
  event?: Pick<Tables<'events'>, 'id' | 'title'> | null
  gameserver?: Pick<Tables<'gameservers'>, 'id' | 'name'> | null
  referendum?: Pick<Tables<'referendums'>, 'id' | 'title'> | null
}

interface ContextInfo {
  label: string
  href: string
  icon: string
}

type TopicBreadcrumb = Pick<Tables<'discussion_topics'>, 'id' | 'name' | 'slug' | 'parent_id'>

const route = useRoute()
const router = useRouter()

const identifier = route.params.id as string

// UUID regex pattern to detect if the identifier is a UUID
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = uuidRegex.test(identifier)

const supabase = useSupabaseClient()
const userId = useUserId()
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const post = ref<DiscussionWithContext | null>(null)
const topicBreadcrumbs = ref<TopicBreadcrumb[]>([])
const publishConfirmOpen = ref(false)
const showNSFWWarning = ref(false)

const isMobile = useBreakpoint('<m')

// Reporting
const showReportModal = ref(false)

const contextInfo = computed<ContextInfo | null>(() => {
  if (!post.value)
    return null

  if (post.value.profile_id) {
    const profileName = post.value.profile?.username ?? post.value.profile_id
    return {
      label: 'profile',
      href: `/profile/${profileName}`,
      icon: 'ph:user-circle',
    }
  }

  if (post.value.project_id) {
    return {
      label: 'project',
      href: `/community/projects/${post.value.project_id}`,
      icon: 'ph:folder',
    }
  }

  if (post.value.event_id) {
    return {
      label: 'event',
      href: `/events/${post.value.event_id}`,
      icon: 'ph:calendar',
    }
  }

  if (post.value.gameserver_id) {
    return {
      label: 'gameserver',
      href: `/servers/gameservers/${post.value.gameserver_id}`,
      icon: 'ph:computer-tower',
    }
  }

  if (post.value.referendum_id) {
    return {
      label: 'referendum',
      href: `/votes/${post.value.referendum_id}`,
      icon: 'ph:user-sound',
    }
  }

  return null
})

async function loadTopicBreadcrumbs(topicId: string | null) {
  if (!topicId) {
    topicBreadcrumbs.value = []
    return
  }

  const { data, error } = await supabase
    .rpc('get_discussion_topic_breadcrumbs', {
      target_topic_id: topicId,
    })

  if (error || !data) {
    topicBreadcrumbs.value = []
    return
  }

  topicBreadcrumbs.value = data as TopicBreadcrumb[]
}

function handlePostUpdate(updated: Tables<'discussions'> | Tables<'discussion_topics'>) {
  if (!('reply_count' in updated))
    return

  post.value = post.value ? { ...post.value, ...updated } : { ...updated }
}

onBeforeMount(() => {
  loading.value = true

  let discussionQuery = supabase
    .from('discussions')
    .select(`
      *,
      profile:profiles!discussions_profile_id_fkey(id, username),
      project:projects(id, title),
      event:events(id, title),
      gameserver:gameservers(id, name),
      referendum:referendums(id, title)
    `)

  if (isUuid) {
    discussionQuery = discussionQuery.or(`id.eq.${identifier},slug.eq.${identifier}`)
  }
  else {
    discussionQuery = discussionQuery.eq('slug', identifier)
  }

  discussionQuery
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) {
        errorMessage.value = error.message
      }
      else if (!data) {
        errorMessage.value = 'Discussion not found'
      }
      else if (data.is_draft && (!userId.value || data.created_by !== userId.value)) {
        errorMessage.value = 'Discussion not found'
        post.value = null
      }
      else {
        post.value = data
        showNSFWWarning.value = !!data.is_nsfw
        void loadTopicBreadcrumbs(data.discussion_topic_id)
      }

      loading.value = false
    })
})

const seoDescription = computed(() => {
  if (!post.value)
    return 'Forum post details'
  return post.value.description
    || stripMarkdown(post.value.markdown, 160)
    || 'A forum post on Hivecom'
})

useSeoMeta({
  title: computed(() => post.value ? `${post.value.title} | Forum` : 'Forum Post'),
  description: seoDescription,
  ogTitle: computed(() => post.value ? `${post.value.title} | Forum` : 'Forum Post'),
  ogDescription: seoDescription,
})

useHead({
  title: computed(() => post.value ? post.value.title ?? 'Forum Post' : 'Forum Post'),
})

// This updates every 10 seconds and forces a re-render on the timestamps. This
// way if the post is open for a longer period of time, it won't show "posted 1
// minute ago" for 10 minutes until you refresh or interact with the page.
const timestampUpdateKey = useInterval(60000)

// Publish post
function publish() {
  if (!post.value)
    return

  publishConfirmOpen.value = false

  supabase
    .from('discussions')
    .update({ is_draft: false })
    .eq('id', post.value.id)
    .then(({
      error,
    }) => {
      if (error) {
        pushToast('Error publishing post')
      }
      else if (post.value) {
        post.value.is_draft = false
        pushToast('Published post')
      }
    })
}

// Track user scroll and display header when the page-title is no longer visible
const pageTitle = useTemplateRef('page-title')
const isPageTitleVisible = useElementVisibility(pageTitle)

// Track if user is at the bottom of the page with about half a screen size of leeway
const { y } = useWindowScroll()

const isUserAtBottom = computed(() => {
  const scrollPosition = y.value

  if (scrollPosition === 0)
    return false

  const windowHeight = window.innerHeight
  const documentHeight = document.documentElement.scrollHeight
  return scrollPosition + windowHeight >= documentHeight - windowHeight
})

function scrollHandler() {
  if (isUserAtBottom.value) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  else {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
  }
}

const { height } = useWindowSize()
</script>

<template>
  <div class="page forum container container-m">
    <!-- Loading state -->
    <template v-if="loading">
      <Spinner />
    </template>

    <!-- Main Content  -->
    <template v-else-if="post">
      <!-- Floating header when scrolling down -->
      <Transition name="fade">
        <section v-if="!isPageTitleVisible" class="forum-post__scroll">
          <div class="container container-m">
            <div>
              <strong class="forum-post__scroll-title">
                <Button
                  class="back-button"
                  variant="gray"
                  plain
                  square
                  size="s"
                  aria-label="Go back to Events page"
                  @click="$router.back()"
                >
                  <Icon class="text-color" name="ph:arrow-left" :size="16" />
                </Button>
                {{ post.title ?? 'Unnamed discussion' }}
              </strong>
              <p v-if="post.description">
                {{ post.description }}
              </p>
            </div>

            <UserAvatar v-if="isMobile" :user-id="post.created_by" />
            <UserDisplay v-else :user-id="post.created_by" show-role />
          </div>
        </section>
      </Transition>

      <section ref="page-title" class="page-title" :class="isMobile ? 'mb-l' : 'mb-xl'">
        <Flex x-between y-center>
          <div class="relative">
            <template v-if="topicBreadcrumbs.length && !isMobile">
              <Button
                class="back-button"
                variant="gray"
                plain
                square
                size="s"
                aria-label="Go back to Events page"
                @click="$router.back()"
              >
                <Icon class="text-color" name="ph:arrow-left" :size="16" />
              </Button>
              <Breadcrumbs>
                <BreadcrumbItem @click="router.push('/forum')">
                  Forum
                </BreadcrumbItem>
                <BreadcrumbItem
                  v-for="topic in topicBreadcrumbs"
                  :key="topic.id"
                  :href="`/forum?activeTopicId=${topic.id}`"
                >
                  {{ topic.name }}
                </BreadcrumbItem>
              </Breadcrumbs>
            </template>
          </div>

          <Flex gap="m" y-center>
            <Badge v-if="post.is_nsfw" variant="danger">
              <Icon name="ph:warning" class="text-color-red" />
              NSFW
            </Badge>
            <Tooltip>
              <span>
                <Icon :size="18" name="ph:eye" />
                {{ post.view_count + 1 }}</span>
              <template #tooltip>
                {{ post.view_count + 1 }} views
              </template>
            </Tooltip>
            <Tooltip>
              <span>
                <Icon :size="18" name="ph:chat-dots" />
                {{ post.reply_count }}
              </span>
              <template #tooltip>
                {{ post.reply_count }} replies
              </template>
            </Tooltip>

            <Flex gap="xxs">
              <Button
                v-if="userId && post.created_by !== userId"
                variant="gray"
                size="s"
                square
                @click="showReportModal = true"
              >
                <Tooltip>
                  <Icon name="ph:flag-bold" />
                  <template #tooltip>
                    <p>Report discussion</p>
                  </template>
                </Tooltip>
              </Button>

              <ForumItemActions
                :key="post.is_draft.toString()"
                table="discussions"
                :data="post"
                :hide-discussion-tabs="true"
                @remove="router.back()"
                @update="handlePostUpdate"
              >
                <template #default="{ toggle }">
                  <Button variant="accent" size="s" @click="toggle">
                    Manage
                  </Button>
                </template>
              </ForumItemActions>
            </Flex>
          </Flex>
        </Flex>

        <Flex y-center x-between gap="m" wrap :class="isMobile ? 'mt-m' : 'mt-xl'">
          <Flex y-center gap="xs" wrap>
            <h1>
              {{ post.title ?? 'Unnamed discussion' }}
            </h1>
            <Badge v-if="post.is_archived" variant="warning">
              <Icon name="ph:archive" class="text-color-yellow" />
              Archived
            </Badge>
          </Flex>
          <Reactions
            v-if="!post.description"
            table="discussions"
            :row-id="post.id"
            :reactions="post.reactions"
          />
        </Flex>

        <Flex v-if="post.description" y-center x-between gap="m" class="mb-m">
          <p>{{ post.description }}</p>
          <Reactions
            table="discussions"
            :row-id="post.id"
            :reactions="post.reactions"
          />
        </Flex>

        <!-- Draft alert and publishing -->
        <Alert v-if="post.is_draft" class="mb-l" variant="info">
          This post is a draft and is currently only visible to you.
          <template #end>
            <Button size="s" variant="accent" @click="publishConfirmOpen = true">
              Publish
            </Button>
          </template>
        </Alert>

        <ConfirmModal
          :open="publishConfirmOpen"
          title="Publish discussion"
          description="Publishing a discussion cannot be undone. Are you sure you want to publish it?"
          @confirm="publish"
          @cancel="publishConfirmOpen = false"
        />

        <!-- Post author & metadata row -->
        <Flex x-between y-center wrap gap="m" :class="{ 'mb-l': contextInfo || !!post.markdown }">
          <UserDisplay :user-id="post.created_by" show-role class="mr-m" />
          <Flex :key="timestampUpdateKey" y-center>
            <Tooltip>
              <span>Posted {{ dayjs(post.created_at).fromNow() }}</span>
              <template #tooltip>
                Posted on {{ formatDate(post.created_at) }}
              </template>
            </Tooltip>
            <Tooltip>
              <span>Last Activity {{ dayjs(post.modified_at).fromNow() }}</span>
              <template #tooltip>
                Last active on {{ formatDate(post.modified_at) }}
              </template>
            </Tooltip>
          </Flex>
        </Flex>

        <!-- Discussion linking card -->
        <Card v-if="contextInfo" class="mt-l" :class="{ 'mb-xl': !!post.markdown }">
          <Flex x-between y-center wrap gap="m">
            <Flex column gap="xs">
              <Flex y-center gap="xs">
                <Icon :name="contextInfo.icon" :size="20" />
                <span>This discussion is linked to {{ contextInfo.label === 'event' ? 'an' : 'a' }} {{ contextInfo.label }}</span>
              </Flex>
            </Flex>
            <NuxtLink :to="contextInfo.href">
              <Button size="s">
                View {{ contextInfo.label }}
              </Button>
            </NuxtLink>
          </Flex>
        </Card>

        <!-- Content -->
        <template v-if="post.markdown">
          <hr v-if="!contextInfo" class="mb-l">
          <button v-if="showNSFWWarning" class="forum-post__nsfw" @click="showNSFWWarning = false">
            <Icon class="text-color-accent" name="ph:caret-down" />
            <p>This discussion is marked as NSFW - click to reveal potentially sensitive content</p>
            <Icon class="text-color-accent" name="ph:caret-up" />
          </button>
          <MDRenderer v-else class="forum-post__content" :md="post.markdown" :skeleton-height="64" />
        </template>
      </section>

      <ComplaintsManager
        v-model:open="showReportModal"
        :context-discussion-id="post.id"
        start-with-submit
      />

      <Discussion
        :id="String(post.id)"
        :key="JSON.stringify(post)"
        type="discussion"
        model="forum"
        placeholder="Write your reply to this thread..."
      />

      <div v-if="height > 1200" class="forum-post__fast-travel">
        <Tooltip>
          <Button size="s" variant="accent" square @click="scrollHandler">
            <Icon :name="isUserAtBottom ? 'ph:arrow-up' : 'ph:arrow-down'" :size="20" />
          </Button>
          <template #tooltip>
            {{ isUserAtBottom ? 'Scroll to top' : 'Scroll to bottom' }}
          </template>
        </Tooltip>
      </div>
    </template>

    <!-- Nothing found or an error -->
    <Alert v-else variant="danger" filled>
      {{ errorMessage ?? 'There was a problem loading the article' }}
    </Alert>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/breakpoints.scss' as *;
@use '@/assets/mixins.scss' as *;

.back-button {
  position: absolute;
  right: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%);
}

:deep(.forum__item-actions) {
  display: block;
}

.forum-post__nsfw {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: var(--border-radius-l);
  background-color: var(--color-bg-raised);
  padding: var(--space-m);
  transition: var(--transition);
  color: var(--color-text-light);
  gap: var(--space-xxs);
  width: 100%;
  min-height: 120px;
  margin-bottom: var(--space-xs);

  p {
    font-size: var(--font-size-m) !important;
    text-align: center;
  }

  &:hover {
    background-color: var(--color-button-gray);
    gap: 0;
  }
}

.forum-post__content {
  p {
    font-size: var(--font-size-xl);
  }
}

.page-title {
  h1 {
    font-size: var(--font-size-xxxxl);
  }

  p {
    text-align: left !important;
    font-size: var(--font-size-xl);
  }

  span {
    color: var(--color-text-lighter);
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--font-size-s);
  }
}

.forum-post__scroll {
  position: fixed;
  top: 64px;
  left: 0;
  width: 100%;
  background-color: var(--color-bg);
  padding-block: var(--space-s);
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  z-index: var(--z-nav);

  .container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-xs);
  }

  // I couldn't get flex-shrink working without issues, so in this instance I'll
  // set the min-width to the size that will always be there
  :deep(.vui-avatar) {
    min-width: 36px;
  }
}

.forum-post__scroll-title {
  display: block;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-black);
  margin-bottom: var(--space-xs);
  position: relative;

  & + p {
    color: var(--color-text-lighter);
  }
}

.forum-post__fast-travel {
  position: sticky;
  bottom: var(--space-m);
  width: fit-content;
  margin-left: auto;
  z-index: var(--z-nav);
  transform: translateX(48px);
  margin-top: -28px;
}

@media screen and (max-width: $breakpoint-m) {
  // Scrolling is easier on phone so this isn't really needed
  .forum-post__fast-travel {
    display: none;
  }
}

@media screen and (max-width: $breakpoint-s) {
  .page-title {
    h1 {
      font-size: var(--font-size-xxxl);
    }

    p {
      font-size: var(--font-size-l);
    }
  }

  .forum-post__scroll-title {
    font-size: var(--font-size-l);

    & + p {
      font-size: var(--font-size-s);
      @include line-clamp(1);
    }
  }
}
</style>
