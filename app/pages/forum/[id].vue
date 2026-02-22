<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Alert, Badge, Button, Card, Flex, Spinner, Tooltip } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import Discussion from '@/components/Discussions/Discussion.vue'
import ForumItemActions from '@/components/Forum/ForumItemActions.vue'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import { formatDate } from '@/lib/utils/date'

dayjs.extend(relativeTime)

// TODO: path to post would be nice, but we'd have to fetch all the parent topics. Maybe a recursive query or some shit? Query parent topics until the parent is null and add breadcrumbs next to the back button
// The design could maybe be breadcrumbs and then just a button with <- arrow positioned absolutely off the container inline with the breadcrumbs

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

const route = useRoute()
const router = useRouter()

const supabase = useSupabaseClient()
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const post = ref<DiscussionWithContext | null>(null)

const isMobile = useBreakpoint('<m')

const contextInfo = computed<ContextInfo | null>(() => {
  if (!post.value)
    return null

  if (post.value.profile_id) {
    const profileName = post.value.profile?.username ?? post.value.profile_id
    return {
      label: 'Profile',
      href: `/profile/${profileName}`,
      icon: 'ph:user-circle',
    }
  }

  if (post.value.project_id) {
    return {
      label: 'Project',
      href: `/community/projects/${post.value.project_id}`,
      icon: 'ph:folder',
    }
  }

  if (post.value.event_id) {
    return {
      label: 'Event',
      href: `/events/${post.value.event_id}`,
      icon: 'ph:calendar',
    }
  }

  if (post.value.gameserver_id) {
    return {
      label: 'Gameserver',
      href: `/servers/gameservers/${post.value.gameserver_id}`,
      icon: 'ph:computer-tower',
    }
  }

  if (post.value.referendum_id) {
    return {
      label: 'Referendum',
      href: `/votes/${post.value.referendum_id}`,
      icon: 'ph:user-sound',
    }
  }

  return null
})

function handlePostUpdate(updated: Tables<'discussions'> | Tables<'discussion_topics'>) {
  if (!('reply_count' in updated))
    return

  post.value = post.value ? { ...post.value, ...updated } : { ...updated }
}

onBeforeMount(() => {
  loading.value = true

  supabase
    .from('discussions')
    .select(`
      *,
      profile:profiles!discussions_profile_id_fkey(id, username),
      project:projects(id, title),
      event:events(id, title),
      gameserver:gameservers(id, name),
      referendum:referendums(id, title)
    `)
    .eq('id', route.params.id)
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) {
        errorMessage.value = error.message
      }
      else if (!data) {
        errorMessage.value = 'Discussion not found'
      }
      else {
        post.value = data
      }

      loading.value = false
    })
})

useSeoMeta({
  title: computed(() => post.value ? `${post.value.title} | Forum` : 'post Details'),
  description: computed(() => post.value?.description || 'post details'),
  ogTitle: computed(() => post.value ? `${post.value.title} | Forum` : 'post Details'),
  ogDescription: computed(() => post.value?.description || 'Forum details'),
})

// This updates every 10 seconds and forces a re-render on the timestamps. This
// way if the post is open for a longer period of time, it won't show "posted 1
// minute ago" for 10 minutes until you refresh or interact with the page.
const timestampUpdateKey = useInterval(60000)
</script>

<template>
  <div class="page forum container container-m">
    <!-- Loading state -->
    <template v-if="loading">
      <Spinner />
    </template>

    <!-- Main Content  -->
    <template v-else-if="post">
      <section class="page-title" :class="isMobile ? 'mb-l' : 'mb-xl'">
        <Flex x-between y-center class="mb-l">
          <Button
            variant="gray"
            plain
            size="s"

            aria-label="Go back to Events page"
            @click="$router.back()"
          >
            <template #start>
              <Icon name="ph:arrow-left" />
            </template>
            Back
          </Button>

          <Flex gap="m" y-center>
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

            <ForumItemActions
              table="discussions"
              :data="post"
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

        <Flex y-center gap="xs" wrap>
          <h1>
            {{ post.title ?? 'Unnamed discussion' }}
          </h1>
          <Badge v-if="post.is_archived" variant="warning">
            <Icon name="ph:archive" class="text-color-yellow" />
            Archived
          </Badge>
        </Flex>

        <Card v-if="contextInfo" class="mb-l mt-m">
          <Flex x-between y-center wrap gap="m">
            <Flex column gap="xs">
              <Flex y-center gap="xs">
                <Icon :name="contextInfo.icon" :size="20" />
                <span>This discussion is linked to a {{ contextInfo.label }}</span>
              </Flex>
            </Flex>
            <NuxtLink :to="contextInfo.href">
              <Button size="s">
                View full {{ contextInfo.label }}
              </Button>
            </NuxtLink>
          </Flex>
        </Card>

        <MDRenderer v-if="post.markdown" class="forum-post__content" :md="post.markdown" :skeleton-height="64" />

        <Flex x-between y-center class="mt-l" wrap gap="m">
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
      </section>

      <Discussion
        :id="String(post.id)"
        :key="JSON.stringify(post)"
        type="discussion"
        model="forum"
        placeholder="Write your reply to this thread..."
        :input-rows="4"
      />
    </template>

    <!-- Nothing found or an error -->
    <Alert v-else variant="danger" filled>
      {{ errorMessage ?? 'There was a problem loading the article' }}
    </Alert>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/breakpoints.scss' as *;

:deep(.forum__item-actions) {
  display: block;
}

.forum-post__content {
  p {
    font-size: var(--font-size-xl);
  }
}

.page section:first-child h1,
.page section:first-child p {
  text-align: left !important;
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

@media screen and (max-width: $breakpoint-s) {
  .page-title {
    h1 {
      font-size: var(--font-size-xxxl);
    }

    p {
      font-size: var(--font-size-l);
    }
  }
}
</style>
