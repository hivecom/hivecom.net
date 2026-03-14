<script setup lang="ts">
import type { Comment, ThreadNode } from './Discussion.vue'
import { Button, Flex, pushToast } from '@dolanske/vui'
import { stripMarkdown } from '@/lib/markdownProcessors'
import { scrollToId, waitForLayoutStability } from '@/lib/utils/common'
import { DISCUSSION_KEYS } from './Discussion.keys'
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
  staggerIndex?: number
}

const {
  data,
  model,
  threadNode,
  children = [],
  depth = 0,
  showOfftopic = false,
  showThreadReplies = false,
  staggerIndex,
} = defineProps<Props>()

const viewMode = inject(DISCUSSION_KEYS.viewMode, ref<'flat' | 'threaded'>('flat'))

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

// Flat mode: expand state seeded from the per-discussion `showThreadReplies`
// setting but overridable per-item by the user clicking the toggle.
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

// Threaded mode: whether this node's sub-tree is folded closed
const threadCollapsed = ref(false)

function toggleThreadCollapsed() {
  threadCollapsed.value = !threadCollapsed.value
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
    :style="staggerIndex != null ? { '--stagger-index': staggerIndex } : undefined"
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
      <Flex x-center class="discussion-comment-wrapper__thread-toggle">
        <Button
          plain
          size="s"
          @click="toggleReplies"
        >
          {{ visibleChildren.length }} {{ visibleChildren.length === 1 ? 'reply' : 'replies' }}
          <template #end>
            <Icon
              :name="repliesExpanded ? 'ph:caret-up' : 'ph:caret-down'"
              :size="12"
              class="discussion-comment-wrapper__thread-caret"
            />
          </template>
        </Button>
      </Flex>

      <!-- Compact one-liner previews -->
      <Transition name="thread-expand">
        <Flex
          v-if="repliesExpanded"
          column
          :gap="1"
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
    <template v-else-if="viewMode === 'threaded' && hasReplies">
      <!-- Collapsed summary pill -->
      <Flex
        v-if="threadCollapsed"
        x-center
        class="discussion-comment-wrapper__thread-toggle discussion-comment-wrapper__thread-toggle--threaded"
      >
        <Button
          plain
          size="s"
          @click="toggleThreadCollapsed"
        >
          {{ visibleChildren.length }} {{ visibleChildren.length === 1 ? 'reply' : 'replies' }}
          <template #end>
            <Icon
              name="ph:caret-down"
              :size="12"
              class="discussion-comment-wrapper__thread-caret"
            />
          </template>
        </Button>
      </Flex>

      <!-- Expanded children with clickable left border line -->
      <div
        v-else
        class="discussion-comment-wrapper__children"
        :style="{ '--nest-depth': Math.min(depth + 1, 6) }"
      >
        <!-- Invisible button over the left border - click to collapse -->
        <button
          class="discussion-comment-wrapper__thread-line"
          title="Collapse thread"
          @click="toggleThreadCollapsed"
        />

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
    </template>
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
    margin-bottom: var(--space-m);

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
    // Threaded mode: indent children; the visible left border is rendered by
    // __thread-line::after so it can respond to hover state on the button.
    position: relative;
    padding-left: var(--space-m);
  }

  &__thread-line {
    // Invisible button sitting exactly over the left border - click to collapse/expand
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 12px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    z-index: 2;

    // The visible border line lives inside the button so it reacts to hover
    &::after {
      content: '';
      display: block;
      position: absolute;
      top: 0;
      bottom: 0;
      width: 1px;
      background-color: color-mix(in srgb, var(--color-border) calc(100% - (var(--nest-depth, 1) * 20%)), transparent);
      transition: background-color var(--transition-fast);
    }

    &:hover::after {
      background-color: var(--color-accent);
    }
  }

  &__thread-toggle {
    width: 100%;
    position: relative;

    &--threaded {
      margin-top: var(--space-xs);
      margin-bottom: var(--space-s);
    }

    &:before {
      content: '';
      display: block;
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      left: 0;
      right: 0;
      border-bottom: 2px dashed var(--color-border-weak);
      z-index: 1;
    }

    &:after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      height: 4px;
      width: 80px;
      background-color: var(--color-bg);
      z-index: 1;
    }

    :deep(.vui-button) {
      position: relative;
      z-index: 3;
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

  &__thread-row {
    --button-padding: 0 !important;

    &--offtopic {
      opacity: 0.5;
    }
  }

  &__thread-avatar {
    flex-shrink: 0;
    // Override the default avatar size to be a touch smaller inline
    :deep(.vui-avatar) {
      width: 18px;
      height: 18px;
    }
  }

  &__thread-author {
    flex-shrink: 0;
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
