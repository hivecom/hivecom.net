<script setup lang="ts">
import type { ActivityItem } from '@/composables/useForumActivityFeed'
import { Button, Flex, Sheet, Skeleton, Spinner, Tab, Tabs, Tooltip } from '@dolanske/vui'
import { computed, onUnmounted, ref, watch } from 'vue'
import ForumLatestItem from '@/components/Forum/ForumLatestItem.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

// The full forum activity feed as a sheet. Everything besides the feed itself
// is optional, so a caller only pays for the parts it asks for.

/** One scrollable feed inside the sheet. The caller owns the fetching. */
export interface ForumLatestPane {
  items: ActivityItem[]
  loading: boolean
  loadingMore: boolean
  exhausted: boolean
}

const props = defineProps<{
  open: boolean
  title: string
  feed: ForumLatestPane
  mentionLookup: Record<string, string>
  /** Second tab holding the reader's own posts. Off means no tab bar at all. */
  mine?: ForumLatestPane
  /** Boundary for the "you've caught up" divider, in ms. */
  visitedAt?: number | null
  /** How much landed since that boundary, counted across the whole feed. */
  newSinceLastVisit?: number
  /** Realtime items waiting behind the loaded feed, for the reload button. */
  pendingCount?: number
}>()

const emit = defineEmits<{
  close: []
  loadMore: []
  loadMoreMine: []
  reload: []
  /** The sheet opened, or its tab changed. Time for the caller to fetch. */
  request: [tab: 'feed' | 'mine']
}>()

const isMobile = useBreakpoint('<s')

const activeTab = ref<'feed' | 'mine'>('feed')
const sentinel = ref<HTMLElement | null>(null)
const mineSentinel = ref<HTMLElement | null>(null)

// Index of the first item older than the last visit. Null when the boundary
// falls outside what's loaded, so the divider never sits above the top item or
// below the last one.
const splitIndex = computed<number | null>(() => {
  if (props.visitedAt == null || props.feed.loading)
    return null

  const idx = props.feed.items.findIndex(
    item => new Date(item.timestampRaw).getTime() <= props.visitedAt!,
  )

  if (idx <= 0 || idx >= props.feed.items.length)
    return null

  return idx
})

// Everything loaded is newer than the boundary, which puts the divider after
// the last item rather than between two of them.
const trailingDivider = computed<boolean>(() => {
  if (props.visitedAt == null || props.feed.loading || splitIndex.value !== null)
    return false

  if (props.feed.items.length === 0 || !props.newSinceLastVisit)
    return false

  return props.feed.items.every(
    item => new Date(item.timestampRaw).getTime() > props.visitedAt!,
  )
})

// ── Infinite scroll sentinels ──────────────────────────────────────────────

// A sentinel only exists once its tab renders past the skeletons, so the
// observers follow the element refs rather than the open state
let observer: IntersectionObserver | null = null
let mineObserver: IntersectionObserver | null = null

function observe(el: HTMLElement, onIntersect: () => void): IntersectionObserver {
  const obs = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting)
        onIntersect()
    },
    { threshold: 0.1 },
  )

  obs.observe(el)

  return obs
}

watch(sentinel, (el) => {
  observer?.disconnect()
  observer = null

  if (el === null)
    return

  observer = observe(el, () => {
    if (!props.feed.loadingMore && !props.feed.exhausted)
      emit('loadMore')
  })
})

watch(mineSentinel, (el) => {
  mineObserver?.disconnect()
  mineObserver = null

  if (el === null)
    return

  mineObserver = observe(el, () => {
    if (props.mine && !props.mine.loadingMore && !props.mine.exhausted)
      emit('loadMoreMine')
  })
})

// ── Fetch requests ─────────────────────────────────────────────────────────

watch(() => props.open, (open) => {
  if (!open) {
    activeTab.value = 'feed'
    return
  }

  emit('request', 'feed')
})

watch(activeTab, (tab) => {
  if (props.open)
    emit('request', tab)
})

onUnmounted(() => {
  observer?.disconnect()
  mineObserver?.disconnect()
})
</script>

<template>
  <Sheet :open="open" :size="456" @close="emit('close')">
    <template #header>
      <Flex y-center x-between expand class="mb-s">
        <h4>
          {{ title }}
        </h4>
        <Button
          v-if="activeTab === 'feed' && (pendingCount ?? 0) > 0"
          size="s"
          variant="accent"
          outline
          @click="emit('reload')"
        >
          <template #start>
            <Icon name="ph:arrow-counter-clockwise" />
          </template>
          {{ pendingCount }} new
        </Button>
      </Flex>

      <Tabs v-if="mine" v-model="activeTab" class="forum__latest-sheet-tabs">
        <Tab value="feed">
          Feed
        </Tab>
        <Tab value="mine">
          My Activity
        </Tab>
      </Tabs>
    </template>

    <Flex v-if="activeTab === 'feed'" column gap="m" class="pt-s">
      <template v-if="feed.loading">
        <Skeleton v-for="i in 6" :key="i" width="100%" height="96px" />
      </template>

      <template v-else>
        <template v-for="(post, index) in feed.items" :key="post.id">
          <Tooltip v-if="splitIndex !== null && index === splitIndex" :disabled="isMobile">
            <div class="forum__latest-divider">
              <Icon name="ph:clock" :size="16" />
            </div>
            <template #tooltip>
              <p>You've caught up</p>
            </template>
          </Tooltip>
          <ForumLatestItem
            :post="post"
            :mention-lookup="mentionLookup"
            expand
          />
        </template>

        <Tooltip v-if="trailingDivider" :disabled="isMobile">
          <div class="forum__latest-divider">
            <Icon name="ph:clock" :size="16" />
          </div>
          <template #tooltip>
            <p>Older posts start here</p>
          </template>
        </Tooltip>

        <div ref="sentinel" class="forum__latest-sentinel">
          <Spinner v-if="feed.loadingMore" />
          <span v-else-if="feed.exhausted" class="text-xs text-color-lighter">All caught up</span>
        </div>
      </template>
    </Flex>

    <Flex v-else-if="mine" column gap="m" class="pt-s">
      <template v-if="mine.loading">
        <Skeleton v-for="i in 6" :key="i" width="100%" height="96px" />
      </template>

      <template v-else-if="mine.items.length === 0 && mine.exhausted">
        <Flex column x-center y-center class="forum__latest-empty">
          <Icon name="ph:pencil-slash" :size="32" />
          <p>Nothing posted yet</p>
        </Flex>
      </template>

      <template v-else>
        <ForumLatestItem
          v-for="post in mine.items"
          :key="post.id"
          :post="post"
          :mention-lookup="mentionLookup"
          expand
        />

        <div ref="mineSentinel" class="forum__latest-sentinel">
          <Spinner v-if="mine.loadingMore" />
          <span v-else-if="mine.exhausted" class="text-xs text-color-lighter">That's everything</span>
        </div>
      </template>
    </Flex>
  </Sheet>
</template>

<style lang="scss" scoped>
.forum__latest-sentinel {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: var(--space-m) 0;
  min-height: 48px;
}

// Marks the reader's last visit. The row-list form of the forum carousel's divider.
.forum__latest-divider {
  display: inline-flex;
  flex-direction: row;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
  width: 100%;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--border-radius-pill);
  margin-inline: 4px;
  z-index: 1;

  // Punches a gap in the rule for the clock to sit in.
  &:after {
    content: '';
    z-index: -1;
    position: absolute;
    top: 50%;
    left: 50%;
    width: 34px;
    height: 3px;
    transform: translate(-50%, -50%);
    background-color: var(--color-bg);
  }

  span {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    padding-block: var(--space-s);
    z-index: 2;
    color: var(--color-accent);
  }
}

.forum__latest-empty {
  padding: var(--space-xl) 0;
  gap: var(--space-s);
  color: var(--color-text-lighter);

  p {
    font-size: var(--font-size-s);
  }
}

.forum__latest-sheet-tabs {
  margin-bottom: -13px;
}
</style>
