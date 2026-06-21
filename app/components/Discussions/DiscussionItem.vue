<script setup lang="ts">
import type { Comment, ProvidedDiscussion, ThreadNode } from './Discussion.types'
import { Button, Flex, pushToast, Sheet } from '@dolanske/vui'
import { nextTick } from 'vue'
import { scrollToId, scrollToIdWhenStable } from '@/lib/utils/common'
import UserAvatar from '../Shared/UserAvatar.vue'
import UserName from '../Shared/UserName.vue'
import { DISCUSSION_KEYS } from './Discussion.keys'
import DiscussionThreadedScope from './DiscussionThreadedScope.vue'
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
  forceInlineExpand = false,
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
  // When true (propagated from a flat-mode inline expansion), this item
  // auto-expands inline and passes the flag to its own children so the
  // whole subtree opens without manual clicks.
  forceInlineExpand?: boolean
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
  // Anchor the link on this comment's timestamp. In chronological (ascending
  // forum) view a reply's position is stable, so the deep-link load can fetch
  // the target block straight from this timestamp and skip the page-lookup RPC.
  // Consumed in useDataDiscussionReplies; ignored in threaded/comment views.
  // Only ever called for this item's own id, so data.created_at is the match.
  if (id === data.id && data.created_at)
    url.searchParams.set('ts', String(new Date(data.created_at).getTime()))
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
const flatInlineExpanded = ref(false)

const INLINE_EXPAND_THRESHOLD = 10

// When the flat-mode sheet opens, lazily load children if not yet fetched.
watch(repliesExpanded, (open) => {
  if (open && !childrenRequested.value && loadChildren != null) {
    childrenRequested.value = true
    void loadChildren(data.id)
  }
})

// Threaded mode: whether this node's sub-tree is folded closed.
// - Root replies (depth 0): driven by the showThreadReplies setting.
// - Sub-replies (depth > 0): always start expanded so clicking a root toggle
//   reveals the full thread without needing additional clicks per level.
function computeThreadCollapsed() {
  if (viewMode.value !== 'threaded')
    return false
  if (depth > 0)
    return false
  return !showThreadRepliesInjected.value
}

const threadCollapsed = ref(computeThreadCollapsed())

function onOpenReplies() {
  if (viewMode.value === 'flat') {
    repliesExpanded.value = true
    return
  }
  const count = replyCountMap?.value?.get(data.id) ?? visibleChildren.value.length
  if (count <= INLINE_EXPAND_THRESHOLD) {
    threadCollapsed.value = false
    flatInlineExpanded.value = true
    if (!childrenRequested.value && loadChildren != null) {
      childrenRequested.value = true
      void loadChildren(data.id)
    }
  }
  else {
    repliesExpanded.value = true
  }
}

// When forceInlineExpand is propagated from a parent's flat inline expansion,
// auto-expand this item and load its children.
watch(() => forceInlineExpand, (force) => {
  if (force && !flatInlineExpanded.value && hasReplies.value) {
    flatInlineExpanded.value = true
    if (!childrenRequested.value && loadChildren != null) {
      childrenRequested.value = true
      void loadChildren(data.id)
    }
  }
}, { immediate: true })

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
    threadCollapsed.value = false
  }
  else {
    threadCollapsed.value = true
    flatInlineExpanded.value = false
  }
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

const openThreadSheetId = inject(DISCUSSION_KEYS.openThreadSheet, ref(null))
const supabase = useSupabaseClient()

// When another item signals this ID, open the sheet.
watch(openThreadSheetId, (id) => {
  if (id === data.id) {
    repliesExpanded.value = true
    openThreadSheetId.value = null
  }
})

async function openFullThread() {
  const { data: rootId, error } = await supabase.rpc('get_thread_root', { p_reply_id: data.id })
  if (error || !rootId)
    return
  repliesExpanded.value = false
  // Ensure the root item is loaded (may be on a different page) before signalling.
  // nextTick lets Vue mount the newly loaded DiscussionItem components so their
  // watch is set up before we write the signal.
  if (navigateToComment)
    await navigateToComment(rootId as string)
  await nextTick()
  openThreadSheetId.value = rootId as string
}

// Close the sheet and jump to this thread's root in the main discussion view.
// The root is a top-level entry, so it's already on the loaded page/window - the
// ?comment change drives the scroll. Only offered when this sheet is a root's.
function goToThreadInDiscussion() {
  repliesExpanded.value = false
  void router.replace({ query: { ...route.query, comment: data.id } })
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
      @open-replies="onOpenReplies"
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
      @open-replies="onOpenReplies"
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
            <Flex gap="s" y-center>
              <p class="text-color-lighter">
                {{ replyCountMap?.get(data.id) ?? visibleChildren.length }} {{ (replyCountMap?.get(data.id) ?? visibleChildren.length) === 1 ? 'reply' : 'replies' }}
              </p>
              <Button v-if="data.reply_to_id" size="s" plain @click="openFullThread">
                Full thread
              </Button>
              <Button v-else size="s" plain @click="goToThreadInDiscussion">
                View in discussion
              </Button>
            </Flex>
          </Flex>
        </Flex>
      </template>

      <DiscussionThreadedScope>
        <!-- Thread root: keep the top-level entry visible in the sheet, not just
             its replies. Highlighted when the root is itself the linked comment. -->
        <DiscussionModelComment
          :data
          :class="{ 'discussion-comment--highlight': isActive }"
          @copy-link="copyLink"
          @scroll-reply="scrollReply"
        />
        <div class="discussion-comment-wrapper__children" :style="{ '--nest-depth': 1 }">
          <DiscussionItem
            v-for="item in visibleChildren"
            :key="item.comment.id"
            :data="item.comment"
            model="comment"
            :depth="1"
            :show-offtopic
          />
        </div>
      </DiscussionThreadedScope>
    </Sheet>

    <!-- Threaded mode: recursively render children as full DiscussionItems -->
    <!-- v-show keeps nested DiscussionItems mounted across mode switches so -->
    <!-- MarkdownRenderer never re-suspends and the skeleton/fade-in flash doesn't appear. -->
    <div v-show="(viewMode === 'threaded' && hasReplies) || (viewMode === 'flat' && flatInlineExpanded)">
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
          :force-inline-expand="flatInlineExpanded"
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
