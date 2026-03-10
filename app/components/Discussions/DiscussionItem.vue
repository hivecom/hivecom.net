<script setup lang="ts">
import type { Comment, ThreadNode } from './Discussion.vue'
import { Button, Flex, pushToast } from '@dolanske/vui'
import { stripMarkdown } from '@/lib/markdown-processors'
import { scrollToId, waitForLayoutStability } from '@/lib/utils/common'
import DiscussionModelComment from './models/DiscussionModelComment.vue'
import DiscussionModelForum from './models/DiscussionModelForum.vue'

interface Props {
  data: Comment
  model?: 'comment' | 'forum'
  // Flat mode: the node for this comment (used for inline reply preview)
  threadNode?: ThreadNode
  // Threaded mode: pre-resolved direct children to render recursively
  children?: ThreadNode[]
  depth?: number
  showOfftopic?: boolean
  showThreadReplies?: boolean
}

const {
  data,
  model,
  threadNode,
  children = [],
  depth = 0,
  showOfftopic = false,
  showThreadReplies = false,
} = defineProps<Props>()

const viewMode = inject('viewMode', ref<'flat' | 'threaded'>('flat'))

const self = useTemplateRef('self')
const route = useRoute()
const router = useRouter()

// Scroll to itself when mounted and the query id matches
const isActive = ref(data.id === route.query.comment)

onMounted(async () => {
  if (isActive.value) {
    // Wait until the page layout has fully settled before scrolling.
    // waitForLayoutStability() polls scrollHeight each animation frame,
    // catching late-rendered markdown, portrait images, avatars, etc.
    await waitForLayoutStability()
    self.value?.$el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Clear the comment query param now that we've scrolled it into view.
    // The highlight stays on until the page is reloaded.
    const query = { ...route.query }
    delete query.comment
    router.replace({ query })
  }
})

// Copy link to item
const { copy } = useClipboard()

function copyLink() {
  const url = new URL(window.location.href)
  url.searchParams.set('comment', data.id)
  copy(url.toString())
  pushToast('Link copied to clipboard', {
    timeout: 1500,
  })
}

// Scroll to reply
function scrollReply() {
  if (!data.reply) {
    return
  }

  router.replace({ query: { comment: data.reply.id } })
  scrollToId(`#comment-${data.reply.id}`, 'start')
}

// ── Inline thread-reply preview (flat mode) ───────────────────────────────────

// Source of children differs by mode:
//   flat     → threadNode.children (resolved from the node map)
//   threaded → children prop (passed down recursively)
const sourceChildren = computed((): ThreadNode[] => {
  if (viewMode.value === 'threaded')
    return children
  return threadNode?.children ?? []
})

// Filter for off-topic visibility
const visibleChildren = computed((): ThreadNode[] =>
  sourceChildren.value.filter(n => !n.comment.is_offtopic || showOfftopic),
)

const hasReplies = computed(() => visibleChildren.value.length > 0)

// Expand state: seeded from the per-discussion `showThreadReplies` setting
// but overridable per-item by the user clicking the toggle.
const repliesExpanded = ref(showThreadReplies)

// Keep in sync when the parent setting changes (unless the user has already
// toggled this item manually - handled by the click itself overriding the ref)
watch(
  () => showThreadReplies,
  (val) => { repliesExpanded.value = val },
)

function toggleReplies() {
  repliesExpanded.value = !repliesExpanded.value
}

function scrollToReply(childComment: Comment) {
  router.replace({ query: { comment: childComment.id } })
  scrollToId(`#comment-${childComment.id}`, 'start')
}

const PREVIEW_LENGTH = 120
</script>

<template>
  <div
    :id="`comment-${data.id}`"
    class="discussion-comment-wrapper"
    :class="data.is_offtopic && 'discussion-comment-wrapper--offtopic'"
  >
    <DiscussionModelComment
      v-if="model === 'comment'"
      ref="self"
      :data
      :class="{ 'discussion-comment--highlight': isActive }"
      @copy-link="copyLink"
      @scroll-reply="scrollReply"
    />
    <DiscussionModelForum
      v-else
      ref="self"
      :data
      :class="{ 'discussion-forum--highlight': isActive }"
      @copy-link="copyLink"
      @scroll-reply="scrollReply"
    />

    <!-- Flat mode: inline one-liner reply preview with expand toggle -->
    <div
      v-if="viewMode === 'flat' && hasReplies"
      class="discussion-comment-wrapper__thread"
      :class="model === 'forum' ? 'discussion-comment-wrapper__thread--forum' : 'discussion-comment-wrapper__thread--comment'"
    >
      <!-- Toggle button -->
      <Button
        plain
        size="s"
        class="discussion-comment-wrapper__thread-toggle"
        @click="toggleReplies"
      >
        <template #start>
          <Icon
            name="ph:chat-dots"
            :size="13"
            class="discussion-comment-wrapper__thread-icon"
          />
        </template>
        {{ visibleChildren.length }} {{ visibleChildren.length === 1 ? 'reply' : 'replies' }}
        <template #end>
          <Icon
            :name="repliesExpanded ? 'ph:caret-up' : 'ph:caret-down'"
            :size="12"
            class="discussion-comment-wrapper__thread-caret"
          />
        </template>
      </Button>

      <!-- Compact one-liner previews -->
      <Transition name="thread-expand">
        <Flex
          v-if="repliesExpanded"
          column
          :gap="0"
          class="discussion-comment-wrapper__thread-list"
        >
          <Button
            v-for="child in visibleChildren"
            :key="child.comment.id"
            plain
            class="discussion-comment-wrapper__thread-row"
            :class="child.comment.is_offtopic && 'discussion-comment-wrapper__thread-row--offtopic'"
            @click="scrollToReply(child.comment)"
          >
            <Flex y-center :gap="8" expand class="discussion-comment-wrapper__thread-row-inner">
              <SharedUserAvatar
                :user-id="child.comment.created_by"
                size="s"
                class="discussion-comment-wrapper__thread-avatar"
              />
              <SharedUserName
                :user-id="child.comment.created_by"
                size="s"
                class="discussion-comment-wrapper__thread-author"
              />
              <span class="discussion-comment-wrapper__thread-preview">
                {{ stripMarkdown(child.comment.markdown, PREVIEW_LENGTH) }}
              </span>
              <Icon
                v-if="child.children.length > 0"
                name="ph:git-branch"
                class="discussion-comment-wrapper__thread-nested-icon"
                :size="12"
              />
            </Flex>
          </Button>
        </Flex>
      </Transition>
    </div>

    <!-- Threaded mode: recursively render children as full DiscussionItems -->
    <div
      v-else-if="viewMode === 'threaded' && hasReplies"
      class="discussion-comment-wrapper__children"
      :style="{ '--nest-depth': Math.min(depth + 1, 6) }"
    >
      <DiscussionItem
        v-for="child in visibleChildren"
        :key="child.comment.id"
        :data="child.comment"
        :model
        :children="child.children"
        :depth="depth + 1"
        :show-offtopic
        :show-thread-replies
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.discussion-comment-wrapper {
  display: block;
  scroll-margin-top: 148px;

  &--offtopic {
    transition: opacity var(--transition-slow);
    opacity: 0.45;

    &:hover,
    &:focus-within {
      opacity: 1;
    }
  }

  &__thread {
    margin-top: 2px;
    margin-bottom: var(--space-xs);

    // Comment model: indent to align with the text content past the avatar
    &--comment {
      margin-left: 40px;
    }

    // Forum model: full-width, sits below the card with a small top gap
    &--forum {
      margin-left: 0;
      margin-top: var(--space-xs);
    }
  }

  &__children {
    // Threaded mode: indent with a left border thread-line
    padding-left: 12px;
    border-left: 2px solid
      color-mix(in srgb, var(--color-border) calc(100% - (var(--nest-depth, 1) * 10%)), transparent);
  }

  &__thread-toggle {
    // Pill shape override on top of VUI plain button
    border-radius: 99px !important;
    font-size: var(--font-size-xs) !important;
    color: var(--color-text-light) !important;

    &:hover {
      color: var(--color-text) !important;
    }
  }

  &__thread-icon {
    color: var(--color-text-lighter);
    flex-shrink: 0;
  }

  &__thread-caret {
    color: var(--color-text-lighter);
    flex-shrink: 0;
    margin-left: 2px;
  }

  &__thread-list {
    margin-top: var(--space-xxs);
    overflow: hidden;
    gap: 1px !important;
  }

  &__thread-row {
    padding: 4px var(--space-xs) !important;
    border-radius: var(--border-radius-s) !important;
    text-align: left;
    justify-content: flex-start !important;

    &:hover {
      background-color: var(--color-bg-raised) !important;
    }

    &--offtopic {
      opacity: 0.5;
    }
  }

  &__thread-row-inner {
    min-width: 0;
  }

  &__thread-avatar {
    flex-shrink: 0;
    // Override the default avatar size to be a touch smaller inline
    :deep(.vui-avatar) {
      width: 18px !important;
      height: 18px !important;
    }
  }

  &__thread-author {
    flex-shrink: 0;
    // Keep the username compact
    :deep(.user-display__link .user-display__username) {
      font-size: var(--font-size-xs) !important;
      font-weight: var(--font-weight-bold);
      color: var(--color-text);
    }
  }

  &__thread-preview {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  &__thread-nested-icon {
    flex-shrink: 0;
    color: var(--color-text-lighter);
    margin-left: auto;
  }
}

// Smooth expand/collapse animation
.thread-expand-enter-active,
.thread-expand-leave-active {
  transition:
    opacity var(--transition),
    transform var(--transition);
  transform-origin: top;
}

.thread-expand-enter-from,
.thread-expand-leave-to {
  opacity: 0;
  transform: scaleY(0.92) translateY(-4px);
}
</style>
