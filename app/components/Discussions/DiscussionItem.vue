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

  /** Pinned duplicates use their own prefix so '#comment-{id}' only matches the list instance */
  idPrefix?: string

  // Flat mode only
  threadNode?: ThreadNode

  // Threaded mode only
  children?: ThreadNode[]
  depth?: number
  showOfftopic?: boolean
  staggerIndex?: number

  // Set by a flat-mode inline expansion and passed down, so the whole subtree opens
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
    // Re-anchors every frame until the position holds for 500ms. A manual
    // scroll hands control back to the user.
    await scrollToIdWhenStable(`#${idPrefix}-${data.id}`, 'center', 12000, 500)
  }
})

// Another comment's scrollReply() can set ?comment to this id
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

  // A comment link works in either view and resolves its own page
  url.searchParams.delete('view')
  url.searchParams.delete('page')

  // A reply's position is stable in ascending forum view, so the deep-link load
  // can skip the page-lookup RPC with this timestamp. Other views ignore it.
  if (id === data.id && data.created_at)
    url.searchParams.set('ts', String(new Date(data.created_at).getTime()))
  copy(url.toString())
  pushToast('Link copied to clipboard', {
    timeout: 1500,
  })
}

// A reply outside the loaded window needs navigateToComment to load its page first
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

// Threaded items get the children prop, flat items get threadNode.children.
// Using whichever is populated keeps both views mounted, so MarkdownRenderer
// resolves while hidden. The comment model keeps children in childrenMap instead.
const sourceChildren = computed((): ThreadNode[] => {
  if (model === 'comment' && childrenMap != null) {
    const raw = childrenMap.value.get(data.id) ?? []
    return raw.map(c => ({ comment: c as unknown as Comment, children: [] }))
  }
  return children.length > 0 ? children : (threadNode?.children ?? [])
})

// Separate from sourceChildren.length, since a root can have zero children after a fetch
const childrenRequested = ref(children.length > 0)

const visibleChildren = computed((): ThreadNode[] =>
  sourceChildren.value.filter(n => !n.comment.is_offtopic || showOfftopic),
)

const hasReplies = computed(() =>
  visibleChildren.value.length > 0 || (replyCountMap?.value?.get(data.id) ?? 0) > 0,
)

const repliesExpanded = ref(false)
const flatInlineExpanded = ref(false)

watch(repliesExpanded, (open) => {
  if (open && !childrenRequested.value && loadChildren != null) {
    childrenRequested.value = true
    void loadChildren(data.id)
  }
})

// Sub-replies start expanded, so opening a root reveals the whole thread
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

  threadCollapsed.value = false
  flatInlineExpanded.value = true
  if (!childrenRequested.value && loadChildren != null) {
    childrenRequested.value = true
    void loadChildren(data.id)
  }
}

watch(() => forceInlineExpand, (force) => {
  if (force && !flatInlineExpanded.value && hasReplies.value) {
    flatInlineExpanded.value = true
    if (!childrenRequested.value && loadChildren != null) {
      childrenRequested.value = true
      void loadChildren(data.id)
    }
  }
}, { immediate: true })

// threadCollapsed is only computed once at setup, so recompute when the view
// mode or the expand-threads setting changes
watch([viewMode, showThreadRepliesInjected], ([, showReplies], [, prevShowReplies]) => {
  threadCollapsed.value = computeThreadCollapsed()

  // The visibility watcher won't re-fire here, since threadCollapsed was true when it last ran
  if (showReplies && !prevShowReplies && !childrenRequested.value && loadChildren != null) {
    childrenRequested.value = true
    void loadChildren(data.id)
  }
})

async function toggleThreadCollapsed() {
  if (threadCollapsed.value) {
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

// The composable clears childrenMap on every view mode change. Without this reset
// the guard below would block re-fetching after switching back to threaded.
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

// ── Showing replies ───────────────────────────────────

// Threaded view with expanded threads reveals inline. Everything else opens the
// sheet: inline expansion only loads one level, so a nested target wouldn't render.
const openThreadSheetId = inject(DISCUSSION_KEYS.openThreadSheet, ref(null))
const supabase = useSupabaseClient()

watch(openThreadSheetId, async (id) => {
  if (id !== data.id)
    return

  openThreadSheetId.value = null
  if (viewMode.value === 'threaded' && showThreadRepliesInjected.value) {
    if (threadCollapsed.value) {
      if (!childrenRequested.value && loadChildren != null) {
        childrenRequested.value = true
        await loadChildren(data.id)
      }
      threadCollapsed.value = false
    }
    return
  }

  repliesExpanded.value = true
})

async function openFullThread() {
  const { data: rootId, error } = await supabase.rpc('get_thread_root', { p_reply_id: data.id })
  if (error || !rootId)
    return

  repliesExpanded.value = false

  // The root may be on another page. nextTick lets its DiscussionItem mount and
  // set up its watcher before the signal is written.
  if (navigateToComment)
    await navigateToComment(rootId as string)
  await nextTick()
  openThreadSheetId.value = rootId as string
}

// A root is already on the loaded page, so the ?comment change drives the scroll
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

    <!-- v-show keeps nested items mounted across mode switches, so MarkdownRenderer
         never re-suspends and flashes the skeleton -->
    <div v-show="(viewMode === 'threaded' && hasReplies) || (viewMode === 'flat' && flatInlineExpanded)">
      <DiscussionThreadToggle
        v-if="threadCollapsed"
        :count="replyCountMap?.get(data.id) ?? visibleChildren.length"
        @toggle="toggleThreadCollapsed"
      />

      <div
        v-else
        class="discussion-comment-wrapper__children"
        :style="{ '--nest-depth': Math.min(depth + 1, 6) }"
      >
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

    // Aligns with the text past the avatar
    &--comment {
      margin-left: 40px;
    }

    &--forum {
      margin-left: 0;
      margin-top: -12px;
      margin-bottom: 4px;
    }
  }

  &__children {
    position: relative;
    padding-left: var(--space-m);
  }

  &__thread-line {
    // Invisible click target over the left border
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

    // The visible line lives in the button so it reacts to hover
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
