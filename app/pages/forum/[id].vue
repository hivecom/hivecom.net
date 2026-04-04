<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Badge, Button, Card, Flex, pushToast, Spinner, Tooltip } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { DISCUSSION_KEYS } from '@/components/Discussions/Discussion.keys'
import Discussion from '@/components/Discussions/Discussion.vue'
import ForumBreadcrumbs from '@/components/Forum/ForumBreadcrumbs.vue'
import ForumItemActions from '@/components/Forum/ForumItemActions.vue'
import Reactions from '@/components/Reactions/Reactions.vue'
import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import CountDisplay from '@/components/Shared/CountDisplay.vue'
import MarkdownRenderer from '@/components/Shared/MarkdownRenderer.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import UserName from '@/components/Shared/UserName.vue'
import { useDataForumUnread } from '@/composables/useDataForumUnread'
import { useDataUser } from '@/composables/useDataUser'
import { useDiscussionCache } from '@/composables/useDiscussionCache'
import { useDiscussionSubscriptionsCache } from '@/composables/useDiscussionSubscriptionsCache'
import { useBulkTopicIcons } from '@/composables/useTopicIcon'
import { stripMarkdown } from '@/lib/markdownProcessors'
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

const { settings } = useDataUserSettings()
const forumUnread = useDataForumUnread()

const identifier = route.params.id as string

// UUID regex pattern to detect if the identifier is a UUID
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = uuidRegex.test(identifier)

const supabase = useSupabaseClient()
const discussionCache = useDiscussionCache()
const subscriptionsCache = useDiscussionSubscriptionsCache()
const userId = useUserId()
const loading = ref(true)
const errorMessage = ref<string | null>(null)
const post = ref<DiscussionWithContext | null>(null)
const topicBreadcrumbs = ref<TopicBreadcrumb[]>([])

// Bulk-fetch icons for all breadcrumb topics
const breadcrumbTopicIds = computed(() => topicBreadcrumbs.value.map(t => t.id))
const { icons: breadcrumbTopicIcons } = useBulkTopicIcons(breadcrumbTopicIds)

const breadcrumbItems = computed(() =>
  topicBreadcrumbs.value.map(topic => ({
    id: topic.id,
    label: topic.name,
    href: `/forum?${topic.slug ? `activeTopic=${topic.slug}` : `activeTopicId=${topic.id}`}`,
    onClick: () => router.push(`/forum?${topic.slug ? `activeTopic=${topic.slug}` : `activeTopicId=${topic.id}`}`),
  })),
)
const publishConfirmOpen = ref(false)
const showNSFWWarning = ref(false)
const nsfwRevealed = ref(false)

const isMobile = useBreakpoint('<s')

// Reporting
const showReportModal = ref(false)

// Subscription
const isSubscribed = ref(false)
const subscriptionLoading = ref(false)

async function fetchSubscription(discussionId: string) {
  if (!userId.value)
    return

  // Check status cache first - avoids a DB round-trip on every page visit
  const cached = subscriptionsCache.getStatus(userId.value, discussionId)
  if (cached !== null) {
    isSubscribed.value = cached
    return
  }

  const { data } = await supabase
    .from('discussion_subscriptions')
    .select('id')
    .eq('user_id', userId.value)
    .eq('discussion_id', discussionId)
    .maybeSingle()

  isSubscribed.value = !!data
  subscriptionsCache.setStatus(userId.value, discussionId, !!data)
}

async function toggleSubscription() {
  if (!userId.value || !post.value || subscriptionLoading.value)
    return

  subscriptionLoading.value = true

  const discussionId = post.value.id

  if (isSubscribed.value) {
    const { error } = await supabase
      .from('discussion_subscriptions')
      .delete()
      .eq('user_id', userId.value)
      .eq('discussion_id', discussionId)

    if (!error) {
      isSubscribed.value = false
      subscriptionsCache.applyUnsubscribeByDiscussion(userId.value, discussionId)
    }
  }
  else {
    const { data, error } = await supabase
      .from('discussion_subscriptions')
      .insert({
        user_id: userId.value,
        discussion_id: discussionId,
      })
      .select('id, discussion_id, last_seen_at, discussion:discussions(title, slug)')
      .single()

    if (!error && data) {
      isSubscribed.value = true
      // Patch the list + status caches so the notification sheet reflects the
      // new subscription without a re-fetch the next time it opens
      subscriptionsCache.applySubscribe(
        userId.value,
        data as unknown as import('@/composables/useDiscussionSubscriptionsCache').SubscriptionRow,
      )
    }
    else if (!error) {
      // insert succeeded but .single() returned no data - just update status
      isSubscribed.value = true
      subscriptionsCache.setStatus(userId.value, discussionId, true)
    }
  }

  subscriptionLoading.value = false
}

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

/**
 * Returns the entity page href for entity-linked discussions that have no
 * discussion_topic_id. These are not browseable via /forum/[id] and should
 * redirect to their parent entity instead.
 *
 * If the discussion has a topic assigned (regardless of entity type), it is a
 * legitimate forum thread and should render normally.
 */
function getEntityHref(data: DiscussionWithContext): string | null {
  // If the discussion has a topic it renders normally - don't redirect.
  if (data.discussion_topic_id != null)
    return null

  if (data.profile_id != null) {
    const profileName = data.profile?.username ?? data.profile_id
    return `/profile/${profileName}`
  }
  if (data.project_id != null) {
    return `/community/projects/${data.project_id}`
  }
  if (data.event_id != null) {
    return `/events/${data.event_id}`
  }
  if (data.gameserver_id != null) {
    return `/servers/gameservers/${data.gameserver_id}`
  }
  if (data.referendum_id != null) {
    return `/votes/${data.referendum_id}`
  }
  return null
}

function handlePostUpdate(updated: Tables<'discussions'> | Tables<'discussion_topics'>) {
  if (!('reply_count' in updated))
    return

  post.value = post.value ? { ...post.value, ...updated } : { ...updated }
}

onBeforeMount(async () => {
  loading.value = true

  // Fast-path: use the cached discussion row if it's still within TTL.
  // The cache stores the enriched DiscussionWithContext shape (extra join fields
  // are carried along even though the cache type is Tables<'discussions'>),
  // so a cache hit is sufficient to render the full page without a DB round-trip.
  const cached = isUuid
    ? (discussionCache.getById(identifier) ?? discussionCache.getBySlug(identifier))
    : discussionCache.getBySlug(identifier)

  if (cached !== null) {
    const data = cached as DiscussionWithContext

    if (data.is_draft && (!userId.value || data.created_by !== userId.value)) {
      errorMessage.value = 'Discussion not found'
      post.value = null
    }
    else {
      const entityHref = getEntityHref(data)
      if (entityHref != null) {
        void router.replace(entityHref)
        loading.value = false
        return
      }

      post.value = data
      showNSFWWarning.value = !!data.is_nsfw && settings.value.show_nsfw_warning
      nsfwRevealed.value = !data.is_nsfw || !settings.value.show_nsfw_warning
      void loadTopicBreadcrumbs(data.discussion_topic_id)
      void fetchSubscription(data.id)
      // Mark the discussion seen in localStorage so the unread dot clears
      // even when navigating here by direct URL rather than from the forum index.
      forumUnread.markDiscussionSeen(data.id, data.reply_count ?? 0)
    }

    loading.value = false
    return
  }

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
        // Entity-linked discussions are not browseable via /forum/[id].
        // Redirect to the entity page if we can, otherwise treat as not found.
        const entityHref = getEntityHref(data)
        if (entityHref != null) {
          void router.replace(entityHref)
          loading.value = false
          return
        }

        post.value = data
        // Warm the discussion cache so back-navigation and the next visit
        // within TTL don't re-fetch. The enriched join fields are stored
        // alongside the base row and will be present on a cache hit.
        discussionCache.set(data)
        // Show the NSFW overlay only when the post is NSFW and the user has
        // warnings enabled. If they have show_nsfw_content disabled entirely,
        // the watchEffect below will redirect them away instead.
        showNSFWWarning.value = !!data.is_nsfw && settings.value.show_nsfw_warning
        // If warnings are disabled but content is allowed, consider it auto-revealed
        nsfwRevealed.value = !data.is_nsfw || !settings.value.show_nsfw_warning
        void loadTopicBreadcrumbs(data.discussion_topic_id)
        void fetchSubscription(data.id)
        // Mark seen in localStorage so the unread dot clears on direct URL visits.
        forumUnread.markDiscussionSeen(data.id, data.reply_count ?? 0)
      }

      loading.value = false
    })
})

// Fetch minimal discussion data at SSR/prerender time so meta tags are populated.
// The full interactive fetch still happens in onBeforeMount (client-only), but
// during prerendering onBeforeMount never runs, leaving post.value null and
// producing "Forum Post" / "Forum post details" for every page.
const { data: seoPost } = await useAsyncData(`discussion-seo-${identifier}`, async () => {
  let query = supabase
    .from('discussions')
    .select('title, description, markdown')

  if (isUuid) {
    query = query.or(`id.eq.${identifier},slug.eq.${identifier}`)
  }
  else {
    query = query.eq('slug', identifier)
  }

  const { data } = await query.maybeSingle()
  return data
})

const seoDescription = computed(() => {
  const source = post.value ?? seoPost.value
  if (!source)
    return 'A forum post on Hivecom'
  return source.description
    || stripMarkdown(source.markdown, 160)
    || 'A forum post on Hivecom'
})

const seoTitle = computed(() => {
  const source = post.value ?? seoPost.value
  return source?.title ? `${source.title} | Forum` : 'Forum Post'
})

useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  ogTitle: seoTitle,
  ogDescription: seoDescription,
})

defineOgImage('Discussion', {
  identifier,
})

useHead({
  title: computed(() => (post.value ?? seoPost.value)?.title ?? 'Forum Post'),
})

// This updates every 10 seconds and forces a re-render on the timestamps. This
// way if the post is open for a longer period of time, it won't show "posted 1
// minute ago" for 10 minutes until you refresh or interact with the page.
// Only show "Edited" when modified_at differs from created_at AND modified_by
// is set - same guard as DiscussionModelForum uses for replies.
const postModifierId = computed(() => {
  if (!post.value)
    return null
  const { modified_at, created_at, modified_by, created_by } = post.value
  if (modified_at === created_at || !modified_by || modified_by === created_by)
    return null
  return modified_by
})
const { user: postModifierUser } = useDataUser(postModifierId, { userTtl: 10 * 60 * 1000 })

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
        discussionCache.set(post.value)
        pushToast('Published post')
      }
    })
}

// Track user scroll and display header when the page-title is no longer visible
/**
 * When the user successfully posts a reply, mark the discussion as seen with
 * the new reply count so that the forum-index activity indicator doesn't fire
 * for discussions the current user was the last to post in.
 */
function handleReplySubmitted(newReplyCount: number, discussionId: string) {
  forumUnread.markDiscussionSeen(discussionId, newReplyCount)
  // Also bump the parent topic's stored reply count so the topic-level unread
  // dot doesn't fire for activity the current user just created.
  if (post.value?.discussion_topic_id != null) {
    forumUnread.bumpTopicReplySeen(post.value.discussion_topic_id)
  }
}

const pageTitle = useTemplateRef('page-title')
const scrollHeaderReady = ref(false)
const isPageTitleVisible = useElementVisibility(pageTitle)

watch(isPageTitleVisible, () => {
  scrollHeaderReady.value = true
}, { once: true })

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

const page = useTemplateRef('page')
const { height: contentHeight } = useElementSize(page)

// If post is NSFW and user has disabled NSFW content, go back to the previous
// page. This is to prevent users from accidentally seeing NSFW content if they
// click on a link or refresh the page. When redirecting, we make sure to check if
// there is a previous page in the history, and if not, we redirect to the forum
watchEffect(() => {
  if (post.value && post.value.is_nsfw && !settings.value.show_nsfw_content) {
    if (window.history.state.back) {
      router.back()
    }
    else {
      router.push('/forum')
    }
  }
})

// Provide a flag to all descendant discussion reply components so they can
// skip their individual per-reply NSFW gates when the thread overlay has
// already been dismissed (or warnings are turned off in settings).
provide(DISCUSSION_KEYS.threadNsfwRevealed, nsfwRevealed)

function revealNsfw() {
  showNSFWWarning.value = false
  nsfwRevealed.value = true
}
</script>

<template>
  <div ref="page" class="page forum container container-m">
    <!-- Loading state -->
    <template v-if="loading">
      <Spinner />
    </template>

    <!-- Main Content  -->
    <template v-else-if="post">
      <!-- Floating header when scrolling down -->
      <Transition name="fade">
        <section v-if="scrollHeaderReady && !isPageTitleVisible" class="forum-post__scroll">
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

            <UserAvatar v-if="isMobile" :user-id="post.created_by" linked />
            <UserDisplay v-else :user-id="post.created_by" show-role />
          </div>
        </section>
      </Transition>

      <section ref="page-title" class="page-title" :class="isMobile ? 'mb-l' : 'mb-xl'">
        <Flex wrap x-between y-center>
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
              <ForumBreadcrumbs
                :items="breadcrumbItems"
                :icons="breadcrumbTopicIcons"
                root-href="/forum"
                :on-root-click="() => router.push('/forum')"
              />
            </template>
            <template v-else-if="isMobile">
              <!-- Back Button -->
              <Flex x-between>
                <Button
                  expand
                  variant="gray"
                  size="s"
                  plain
                  aria-label="Go back to Forum"
                  @click="$router.push('/forum')"
                >
                  <template #start>
                    <Icon name="ph:arrow-left" />
                  </template>
                  Forum
                </Button>
              </Flex>
            </template>
          </div>

          <Flex gap="m" y-center>
            <Badge v-if="post.is_nsfw" variant="danger">
              <Icon name="ph:warning" class="text-color-red" />
              NSFW
            </Badge>
            <Flex y-center gap="xxs">
              <Icon :size="18" name="ph:eye" />
              <CountDisplay :value="post.view_count + 1" class="text-s text-color-lighter" />
            </Flex>
            <Flex y-center gap="xxs">
              <Icon :size="18" name="ph:chat-dots" />
              <CountDisplay :value="post.reply_count" class="text-s text-color-lighter" />
            </Flex>

            <Flex gap="xxs">
              <Button
                v-if="userId"
                variant="gray"
                size="s"
                square
                :loading="subscriptionLoading"
                @click="toggleSubscription"
              >
                <Tooltip>
                  <Icon
                    :name="isSubscribed ? 'ph:bell-ringing' : 'ph:bell'"
                    :class="{ 'text-color-accent': isSubscribed }"
                  />
                  <template #tooltip>
                    <p>{{ isSubscribed ? 'Unsubscribe' : 'Subscribe' }}</p>
                  </template>
                </Tooltip>
              </Button>

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
                  <Button variant="gray" size="s" @click="toggle">
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
            <Badge v-if="post.is_locked" variant="neutral">
              <Icon name="ph:lock" />
              Locked
            </Badge>
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

        <Flex v-if="post.description" :column="isMobile" :y-center="!isMobile" x-between gap="m" class="mb-m">
          <p>{{ post.description }}</p>
          <Reactions
            :class="isMobile ? 'reactions--mobile' : ''"
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
        <Flex :column="isMobile" :x-between="!isMobile" :y-center="!isMobile" wrap gap="s" :class="{ 'mb-l': contextInfo || !!post.markdown }">
          <UserDisplay :user-id="post.created_by" show-role />
          <Flex :key="timestampUpdateKey" y-center wrap :gap="4" class="forum-post__timestamps">
            <Tooltip :delay="500">
              <span>Posted {{ dayjs(post.created_at).fromNow() }}</span>
              <template #tooltip>
                Posted on {{ formatDate(post.created_at) }}
              </template>
            </Tooltip>
            <template v-if="post.modified_at !== post.created_at">
              <span aria-hidden="true">·</span>
              <Tooltip :delay="500">
                <span>Edited {{ dayjs(post.modified_at).fromNow() }}</span>
                <template #tooltip>
                  Edited on {{ formatDate(post.modified_at) }}
                </template>
              </Tooltip>
              <template v-if="postModifierId && postModifierUser">
                <span class="text-s">by <UserName size="s" show-preview :user-id="postModifierId" inherit /></span>
              </template>
            </template>
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
          <MarkdownRenderer class="forum-post__content" :md="post.markdown" :skeleton-height="64" />
        </template>
      </section>

      <!-- Fullscreen NSFW overlay -->
      <!-- TODO: remove this and add option to Modal/Sheet to increase background blur. No need to reimplement modal -->
      <Transition name="fade">
        <div v-if="showNSFWWarning" class="forum-post__nsfw-overlay">
          <div class="forum-post__nsfw-overlay-inner">
            <Icon class="forum-post__nsfw-overlay-icon" name="ph:warning" />
            <h2>Sensitive Content</h2>
            <p>This discussion is marked as NSFW and may contain potentially sensitive or explicit content.</p>
            <Flex gap="s" y-center x-center wrap>
              <Button variant="accent" @click="revealNsfw">
                Reveal content
              </Button>
              <Button variant="gray" @click="$router.back()">
                Go back
              </Button>
            </Flex>
          </div>
        </div>
      </Transition>

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
        @reply-submitted="handleReplySubmitted"
      />

      <div v-show="contentHeight > 1600" class="forum-post__fast-travel">
        <Tooltip>
          <Button size="s" plain square @click="scrollHandler">
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

.forum-post__nsfw-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: color-mix(in srgb, var(--color-bg) 85%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.forum-post__nsfw-overlay-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-m);
  max-width: 480px;
  padding: var(--space-xl);
  border-radius: var(--border-radius-l);
  background-color: var(--color-bg-raised);
  border: 1px solid var(--color-border);
  margin: var(--space-l);

  h2 {
    font-size: var(--font-size-xxl);
  }

  p {
    color: var(--color-text-light);
    font-size: var(--font-size-m);
  }
}

.forum-post__nsfw-overlay-icon {
  font-size: 48px;
  color: var(--color-text-red);
}

.back-button {
  position: absolute;
  right: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%);
}

:deep(.reactions--mobile) {
  flex-direction: row-reverse !important;
  flex-wrap: wrap !important;
  justify-content: flex-start !important;
  margin-left: 0 !important;
}

:deep(.forum__item-actions) {
  display: block;
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

  > div {
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
  position: relative;

  & + p {
    color: var(--color-text-lighter);
    margin-top: var(--space-xs);
  }
}

.forum-post__fast-travel {
  position: sticky;
  bottom: var(--space-m);
  width: fit-content;
  margin-left: auto;
  z-index: var(--z-nav);
  transform: translateX(48px) translateY(-40px);

  .iconify {
    color: var(--color-accent);
  }
}

@media screen and (max-width: $breakpoint-m) {
  .page.forum.container {
    max-width: 100%;
    padding-inline: 0;
  }

  // Scrolling is easier on phone so this isn't really needed
  .forum-post__fast-travel {
    display: none;
  }
}

@media screen and (max-width: $breakpoint-s) {
  .forum-post__timestamps {
    color: var(--color-text-light);
    font-size: var(--font-size-s);
  }

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
