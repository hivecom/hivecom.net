<script setup lang="ts">
import type { Comment, ProvidedDiscussion, ThreadNode } from './Discussion.types'
import { Flex, pushToast, Sheet } from '@dolanske/vui'
import { scrollToId, scrollToIdWhenStable } from '@/lib/utils/common'
import UserAvatar from '../Shared/UserAvatar.vue'
import UserName from '../Shared/UserName.vue'
import { DISCUSSION_KEYS } from './Discussion.keys'
import DiscussionThreadToggle from './DiscussionThreadToggle.vue'
import DiscussionModelComment from './models/DiscussionModelComment.vue'
import DiscussionModelForum from './models/DiscussionModelForum.vue'

const {
  data,
  model,
  threadNode,
  children = [],
  depth = 0,
  showOfftopic = false,
  staggerIndex,
  idPrefix = 'comment',
} = defineProps<Props>()

const loadChildren = inject(DISCUSSION_KEYS.loadChildren)
const childrenMap = inject(DISCUSSION_KEYS.childrenMap)
const navigateToComment = inject(DISCUSSION_KEYS.navigateToComment)

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
  staggerIndex?: number
}

const viewMode = inject(DISCUSSION_KEYS.viewMode, ref<'flat' | 'threaded'>('flat'))
const showThreadRepliesInjected = inject(DISCUSSION_KEYS.showThreadReplies, ref(false))
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
    // scrollToIdWhenStable scrolls immediately on the first rAF tick then
    // keeps re-anchoring every frame until the element's position has been
    // stable for 500ms. If the user scrolls manually the loop exits and cedes
    // control to them.
    await scrollToIdWhenStable(`#${idPrefix}-${data.id}`, 'center', 12000, 500)
  }
})

// Scroll into view whenever another comment's scrollReply() sets ?comment=<this id> in the URL.
watch(isActive, async (active) => {
  if (!active)
    return
  await scrollToIdWhenStable(`#${idPrefix}-${data.id}`, 'center', 12000, 500)
}, { immediate: false })

// Copy link to item
const { copy } = useClipboard()

function copyLink() {
  copyLinkForComment(data.id)
}

function copyLinkForComment(id: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('comment', id)
  copy(url.toString())
  pushToast('Link copied to clipboard', {
    timeout: 1500,
  })
}

// Scroll to reply - if the reply is in the DOM, scroll to it directly.
// If it's not (loaded via lazy fetch but not in the current window), use
// navigateToComment to load the surrounding page and then scroll to it.
async function scrollReply() {
  const replyId = data.reply?.id ?? data.reply_to_id
  if (!replyId)
    return

  const el = document.querySelector(`#comment-${replyId}`)
  if (el) {
    router.replace({ query: { comment: replyId } })
    scrollToId(`#comment-${replyId}`, 'start')
  }
  else if (navigateToComment) {
    await navigateToComment(replyId)
    router.replace({ query: { comment: replyId } })
  }
}

// ── Inline thread-reply preview (flat mode) ───────────────────────────────────

// Always use whichever children source is populated so both the flat inline
// preview and the threaded recursive subtree stay mounted at all times.
// This means MarkdownRenderer resolves while hidden and no flash occurs on switch.
//   threaded list items → children prop is populated, threadNode is undefined
//   flat list items     → threadNode.children is populated, children is []
// For the comment model, children are stored in childrenMap (not merged into the
// flat comments list), so we read directly from there instead of threadNode.
const sourceChildren = computed((): ThreadNode[] => {
  if (model === 'comment' && childrenMap != null) {
    const raw = childrenMap.value.get(data.id) ?? []
    return raw.map(c => ({ comment: c as unknown as Comment, children: [] }))
  }
  return children.length > 0 ? children : (threadNode?.children ?? [])
})

// Whether children have been requested at least once (threaded lazy load).
// Separate from sourceChildren.length > 0 because a root can legitimately
// have zero children even after a successful fetch.
const childrenRequested = ref(children.length > 0)

// Filter for off-topic visibility
const visibleChildren = computed((): ThreadNode[] =>
  sourceChildren.value.filter(n => !n.comment.is_offtopic || showOfftopic),
)

const hasReplies = computed(() =>
  visibleChildren.value.length > 0 || (replyCountMap?.value?.get(data.id) ?? 0) > 0,
)

// Flat mode: sheet always starts closed - only opens on explicit user click.
const repliesExpanded = ref(false)

// When the flat-mode sheet opens, lazily load children if not yet fetched.
watch(repliesExpanded, (open) => {
  if (open && !childrenRequested.value && loadChildren != null) {
    childrenRequested.value = true
    void loadChildren(data.id)
  }
})

// Threaded mode: whether this node's sub-tree is folded closed.
// - Root replies (depth 0): driven by the showThreadReplies setting.
// - Sub-replies (depth > 0): auto-expanded unless they have more than 5 replies,
//   in which case they follow the same setting as roots.
function computeThreadCollapsed() {
  if (viewMode.value !== 'threaded')
    return false
  if (depth > 0) {
    const count = replyCountMap?.value?.get(data.id) ?? 0
    return count > 5 ? !showThreadRepliesInjected.value : false
  }
  return !showThreadRepliesInjected.value
}

const threadCollapsed = ref(computeThreadCollapsed())

// Re-evaluate collapsed state whenever the view mode or the expand-threads setting
// changes. The IIFE only ran once at setup, so items mounted in flat mode (or while
// the setting had a different value) need this to get the correct collapsed state.
watch([viewMode, showThreadRepliesInjected], ([, showReplies], [, prevShowReplies]) => {
  threadCollapsed.value = computeThreadCollapsed()

  // When the global "expand reply threads" toggle is turned on, lazily load
  // children if they haven't been fetched yet - the visibility watcher won't
  // fire again because threadCollapsed was already true when it last ran.
  if (showReplies && !prevShowReplies && !childrenRequested.value && loadChildren != null) {
    childrenRequested.value = true
    void loadChildren(data.id)
  }
})

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
//
// NOTE: childrenMap in the composable is cleared whenever the view mode changes,
// so we must reset childrenRequested here too - otherwise the guard below would
// permanently block re-fetching after a flat→threaded switch.
watch(viewMode, (mode, prev) => {
  if (mode === 'threaded' && prev !== 'threaded')
    childrenRequested.value = false
})

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
            @copy-link="copyLinkForComment(item.comment.id)"
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
            @copy-link="copyLinkForComment(item.comment.id)"
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
      <DiscussionThreadToggle
        v-if="threadCollapsed"
        :count="replyCountMap?.get(data.id) ?? visibleChildren.length"
        @toggle="toggleThreadCollapsed"
      />

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
}
</style>
