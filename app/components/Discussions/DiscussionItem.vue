<script setup lang="ts">
import type { Comment, ProvidedDiscussion, ThreadNode } from './Discussion.types'
import { Button, Flex, pushToast, Sheet } from '@dolanske/vui'
import { scrollToId, waitForLayoutStability } from '@/lib/utils/common'
import UserAvatar from '../Shared/UserAvatar.vue'
import UserName from '../Shared/UserName.vue'
import { DISCUSSION_KEYS } from './Discussion.keys'
import DiscussionModelComment from './models/DiscussionModelComment.vue'
import DiscussionModelForum from './models/DiscussionModelForum.vue'

const {
  data,
  model,
  threadNode,
  children = [],
  depth = 0,
  showOfftopic = false,
  showThreadReplies = false,
  staggerIndex,
  idPrefix = 'comment',
} = defineProps<Props>()

const loadChildren = inject(DISCUSSION_KEYS.loadChildren)

interface Props {
  data: Comment
  model?: 'comment' | 'forum'
  /** ID prefix for the wrapper element. Defaults to 'comment'. Use a different
   *  value (e.g. 'pinned-comment') for pinned duplicates so querySelector
   *  can distinguish the list instance from the pinned banner. */
  idPrefix?: string
  // Flat mode: the node for this comment (used for inline reply preview)
  threadNode?: ThreadNode
  // Threaded mode: pre-resolved direct children to render recursively
  children?: ThreadNode[]
  depth?: number
  showOfftopic?: boolean
  showThreadReplies?: boolean
  staggerIndex?: number
}

const viewMode = inject(DISCUSSION_KEYS.viewMode, ref<'flat' | 'threaded'>('flat'))
const discussion = inject(DISCUSSION_KEYS.discussion) as ProvidedDiscussion
const replyCountMap = inject(DISCUSSION_KEYS.replyCountMap)
const isPinned = computed(() => discussion?.value?.pinned_reply_id === data.id)

const self = useTemplateRef('self')
const route = useRoute()
const router = useRouter()

// Scroll to itself when mounted and the query id matches
const isActive = computed(() => data.id === route.query.comment)

onMounted(async () => {
  if (isActive.value) {
    // Wait until the page layout has fully settled before scrolling.
    // waitForLayoutStability() polls scrollHeight each animation frame,
    // catching late-rendered markdown, portrait images, avatars, etc.
    await waitForLayoutStability()

    const el = Array.isArray(self.value) ? self.value[0]?.$el : self.value?.$el
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
})

// Scroll into view whenever another comment's scrollReply() sets ?comment=<this id> in the URL.
// Use waitForLayoutStability() to handle late-rendering content (images, avatars) shifting the layout.
watch(isActive, async (active) => {
  if (!active)
    return
  await waitForLayoutStability()
  const el = Array.isArray(self.value) ? self.value[0]?.$el : self.value?.$el
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}, { immediate: false })

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

// Always use whichever children source is populated so both the flat inline
// preview and the threaded recursive subtree stay mounted at all times.
// This means MarkdownRenderer resolves while hidden and no flash occurs on switch.
//   threaded list items → children prop is populated, threadNode is undefined
//   flat list items     → threadNode.children is populated, children is []
const sourceChildren = computed((): ThreadNode[] =>
  children.length > 0 ? children : (threadNode?.children ?? []),
)

// Whether children have been requested at least once (threaded lazy load).
// Separate from sourceChildren.length > 0 because a root can legitimately
// have zero children even after a successful fetch.
const childrenRequested = ref(children.length > 0)

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

// When the flat-mode sheet opens, lazily load children if not yet fetched.
watch(repliesExpanded, (open) => {
  if (open && !childrenRequested.value && loadChildren != null) {
    childrenRequested.value = true
    void loadChildren(data.id)
  }
})

// Threaded mode: whether this node's sub-tree is folded closed
const threadCollapsed = ref(false)

async function toggleThreadCollapsed() {
  if (threadCollapsed.value) {
    // Expanding: lazily load children if not yet fetched
    if (!childrenRequested.value && loadChildren != null) {
      childrenRequested.value = true
      await loadChildren(data.id)
    }
  }
  threadCollapsed.value = !threadCollapsed.value
}

// ── Lazy child loading (threaded mode) ────────────────────────────────────────

const wrapperEl = useTemplateRef<HTMLDivElement>('wrapperEl')

// Becomes true the first time this item enters the viewport.
// The observer stops itself after the first intersection so it only fires once.
const isVisible = ref(false)
const { stop: stopVisibilityObserver } = useIntersectionObserver(
  wrapperEl,
  ([entry]) => {
    if (entry?.isIntersecting) {
      isVisible.value = true
      stopVisibilityObserver()
    }
  },
)

// Trigger child fetch when:
//   • the item scrolls into view while already in threaded mode, OR
//   • the mode switches to threaded while the item is already visible.
// Guards prevent double-fetching and respect the collapsed state.
watch(
  [isVisible, viewMode],
  ([visible, mode]) => {
    if (!visible || mode !== 'threaded' || childrenRequested.value || loadChildren == null || threadCollapsed.value)
      return
    childrenRequested.value = true
    void loadChildren(data.id)
  },
)

// ── Showing replies in a sheet ───────────────────────────────────

function stripReplyData(entry: Comment) {
  return {
    ...entry,
    reply: null,
  }
}
</script>

<template>
  <div
    :id="`${idPrefix}-${data.id}`"
    ref="wrapperEl"
    class="discussion-comment-wrapper"
    :class="data.is_offtopic && 'discussion-comment-wrapper--offtopic'"
    :style="staggerIndex != null ? { '--stagger-index': staggerIndex } : undefined"
  >
    <DiscussionModelComment
      v-if="model === 'comment'"
      ref="self"
      :data
      :thread-reply-count="viewMode === 'flat' ? (replyCountMap?.get(data.id) ?? visibleChildren.length) : undefined"
      :class="{ 'discussion-comment--highlight': isActive,
                'discussion-comment--pinned': isPinned }"
      @copy-link="copyLink"
      @scroll-reply="scrollReply"
      @open-replies="repliesExpanded = true"
    />
    <DiscussionModelForum
      v-else
      ref="self"
      :data
      :thread-reply-count="viewMode === 'flat' ? (replyCountMap?.get(data.id) ?? visibleChildren.length) : undefined"
      :class="{ 'discussion-forum--highlight': isActive,
                'discussion-forum--pinned': isPinned }"
      @copy-link="copyLink"
      @scroll-reply="scrollReply"
      @open-replies="repliesExpanded = true"
    />

    <!-- Flat mode: sheet for thread replies (triggered from within the model components) -->
    <Sheet :open="repliesExpanded" :size="model === 'forum' ? 756 : 512" separators @close="repliesExpanded = false">
      <template #header>
        <Flex gap="m">
          <UserAvatar size="l" :user-id="data.created_by" />
          <Flex column gap="xxs">
            <h4>
              <UserName inherit :user-id="data.created_by" />'s thread
            </h4>
            <p class="text-color-lighter">
              {{ replyCountMap?.get(data.id) ?? visibleChildren.length }} {{ (replyCountMap?.get(data.id) ?? visibleChildren.length) === 1 ? 'reply' : 'replies' }}
            </p>
          </Flex>
        </Flex>
      </template>

      <Flex column gap="s" expand>
        <template v-if="model === 'forum'">
          <DiscussionModelForum
            v-for="item in visibleChildren"
            :key="item.comment.id"
            ref="self"
            :data="stripReplyData(item.comment)"
            @interact="repliesExpanded = false"
          />
        </template>
        <template v-else>
          <DiscussionModelComment
            v-for="item in visibleChildren"
            :key="item.comment.id"
            ref="self"
            class="w-100"
            :data="stripReplyData(item.comment)"
            @interact="repliesExpanded = false"
          />
        </template>
      </Flex>
    </Sheet>

    <!-- Threaded mode: recursively render children as full DiscussionItems -->
    <!-- v-show keeps nested DiscussionItems mounted across mode switches so -->
    <!-- MarkdownRenderer never re-suspends and the skeleton/fade-in flash doesn't appear. -->
    <div v-show="viewMode === 'threaded' && hasReplies">
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
    </div>
  </div>
</template>

<style scoped lang="scss">
.discussion-comment-wrapper {
  display: block;
  scroll-margin-top: 148px;

  /* &--pinned-first {
    margin-block: var(--space-l);
  } */

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
      margin-top: -12px;
      margin-bottom: 4px;
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
}
</style>
