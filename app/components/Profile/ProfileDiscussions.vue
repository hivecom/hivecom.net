<script setup lang="ts">
import { Card, Flex, Skeleton } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import MarkdownPreview from '@/components/Shared/MarkdownPreview.vue'
import { useBulkDataUser } from '@/composables/useDataUser'
import { useDiscussionCache } from '@/composables/useDiscussionCache'
import { extractMentionIds } from '@/lib/markdownProcessors'

const props = defineProps<Props>()

dayjs.extend(relativeTime)

interface Props {
  profileId: string
  username?: string | null
}

interface ReplyWithDiscussion {
  id: string
  markdown: string
  created_at: string
  discussion_id: string
  discussionTitle: string | null
  discussionSlug: string | null
  href: string
}

const supabase = useSupabaseClient()
const discussionCache = useDiscussionCache()

const replies = ref<ReplyWithDiscussion[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

async function fetchReplies() {
  loading.value = true
  error.value = null

  const { data: replyData, error: replyError } = await supabase
    .from('forum_discussion_replies')
    .select('id, markdown, created_at, discussion_id')
    .eq('created_by', props.profileId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(3)

  if (replyError) {
    error.value = replyError.message
    loading.value = false
    return
  }

  if (!replyData || replyData.length === 0) {
    replies.value = []
    loading.value = false
    return
  }

  const discussionIds = [...new Set(replyData.map(r => r.discussion_id))]

  const { data: discussionData } = await supabase
    .from('discussions')
    .select('*')
    .in('id', discussionIds)

  const discussionMap = new Map(
    (discussionData ?? []).map(d => [d.id, d]),
  )

  // Warm the discussion cache as a side effect so subsequent Discussion.vue
  // renders of the same discussions don't need to re-fetch.
  for (const d of discussionData ?? []) {
    discussionCache.set(d)
  }

  // Format replies and strip out empty content
  const result = replyData
    .map((reply) => {
      const discussion = discussionMap.get(reply.discussion_id)
      const slug = discussion?.slug ?? reply.discussion_id
      return {
        id: reply.id,
        markdown: reply.markdown,
        created_at: reply.created_at,
        discussion_id: reply.discussion_id,
        discussionTitle: discussion?.title ?? null,
        discussionSlug: slug,
        href: `/forum/${slug}?comment=${reply.id}`,
      }
    })
    .filter(reply => reply.markdown !== '#empty')

  replies.value = result
  loading.value = false
}

onMounted(() => {
  fetchReplies()
})

watch(() => props.profileId, () => {
  fetchReplies()
})

const hasReplies = computed(() => replies.value.length > 0)

// Collect all mention IDs across all replies into a single deduplicated set
const allMentionIds = computed(() =>
  [...new Set(replies.value.flatMap(r => extractMentionIds(r.markdown)))],
)
const { users: mentionUsers } = useBulkDataUser(allMentionIds, { includeAvatar: false })
const mentionLookup = computed<Record<string, string>>(() => {
  const lookup: Record<string, string> = {}
  for (const [id, u] of mentionUsers.value.entries()) {
    if (u?.username)
      lookup[id] = u.username
  }
  return lookup
})

const emptyStateText = computed(() => {
  return `${props.username ?? 'This user'} hasn't posted any replies yet.`
})
</script>

<template>
  <Card separators class="profile-discussions card-bg">
    <template #header>
      <Flex x-between y-center>
        <Flex y-center gap="xs">
          <h4>Recent Replies</h4>
          <span v-if="!loading" class="counter">{{ replies.length }}</span>
        </Flex>
      </Flex>
    </template>

    <!-- Loading State -->
    <Flex v-if="loading" column class="profile-discussions__loading">
      <div v-for="i in 3" :key="`reply-skeleton-${i}`" class="profile-discussions__item profile-discussions__item--skeleton">
        <Flex x-between y-center expand class="mb-xs">
          <Skeleton width="110px" height="11px" />
          <Skeleton width="55px" height="11px" />
        </Flex>
        <Skeleton width="90%" height="13px" />
      </div>
    </Flex>

    <!-- Error State -->
    <Flex v-else-if="error" column y-center x-center class="profile-discussions__empty">
      <Icon name="ph:warning" size="32" class="text-color-light" />
      <p class="text-color-light text-s text-center">
        Failed to load replies.
      </p>
    </Flex>

    <!-- Replies List -->
    <Flex v-else-if="hasReplies" column gap="xxs">
      <NuxtLink
        v-for="reply in replies"
        :key="reply.id"
        :href="reply.href"
        class="profile-discussions__item"
      >
        <Flex x-between y-center expand class="profile-discussions__item-header">
          <span class="profile-discussions__context">
            <Icon name="ph:chats-circle" :size="12" class="profile-discussions__context-icon" />
            Reply in <strong>{{ reply.discussionTitle ?? 'Discussion' }}</strong>
          </span>
          <span class="profile-discussions__timestamp">{{ dayjs(reply.created_at).fromNow() }}</span>
        </Flex>
        <MarkdownPreview :markdown="reply.markdown" :mention-lookup="mentionLookup" :max-length="120" class="profile-discussions__content" />
      </NuxtLink>
    </Flex>

    <!-- Empty State -->
    <Flex v-else column y-center x-center class="profile-discussions__empty">
      <Icon name="ph:chats-circle" size="32" class="text-color-light" />
      <p class="text-color-light text-s text-center">
        {{ emptyStateText }}
      </p>
    </Flex>
  </Card>
</template>

<style lang="scss" scoped>
@use '@/assets/mixins.scss' as *;

.profile-discussions {
  overflow: hidden;

  :deep(.vui-card-content) {
    padding: var(--space-xs) !important;
  }

  &__loading {
    padding: 0;
  }

  &__item {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-xs);
    border-radius: var(--border-radius-m);
    text-decoration: none;
    color: inherit;
    transition: var(--transition-fast);
    cursor: pointer;
    width: 100%;

    &:hover {
      background-color: var(--color-bg-raised);
    }

    &--skeleton {
      cursor: default;
      pointer-events: none;

      &:hover {
        background-color: transparent;
      }
    }
  }

  &__item-header {
    width: 100%;
    min-width: 0;
  }

  &__context {
    display: block;
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;

    strong {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
    }
  }

  &__context-icon {
    vertical-align: -1px;
    margin-right: var(--space-xxs);
  }

  &__timestamp {
    flex-shrink: 0;
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
  }

  &__content {
    @include line-clamp(2);
    font-size: var(--font-size-s);
    color: var(--color-text);
    line-height: 1.4;
    margin: 0;
  }

  &__empty {
    min-height: 140px;
    gap: var(--space-m);
    text-align: center;

    p {
      margin: 0;
      max-width: 280px;
    }
  }
}
</style>
