<script setup lang="ts">
import type { ActivityItem } from '@/composables/useForumActivityFeed'
import type { UseForumActivityFeedPaginatedOptions } from '@/composables/useForumActivityFeedPaginated'
import { Badge, Button, Carousel, Flex, Sheet, Skeleton, Spinner, Tab, Tabs, Tooltip } from '@dolanske/vui'
import ForumLatestItem from '@/components/Forum/ForumLatestItem.vue'

import { useBulkDataUser } from '@/composables/useDataUser'
import { useForumActivityFeedPaginated } from '@/composables/useForumActivityFeedPaginated'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  loading: boolean
  latestPosts: ActivityItem[]
  postSinceYesterday: number
  /**
   * Authoritative server-side count of new forum activity since the user's
   * last visit, excluding their own posts. Drives the "since last visit"
   * badge. Computed locally as a fallback when the prop isn't supplied so
   * older callers keep working.
   */
  postsSinceLastVisit?: number
  lastVisitedAt: string | null
  mentionLookup: Record<string, string>
  // Pass-through options for the paginated sheet feed
  feedOptions: Omit<UseForumActivityFeedPaginatedOptions, never>
  // Count of incoming realtime items not yet in the sheet feed
  feedPendingCount?: number
}>()

const emit = defineEmits<{
  feedReloaded: []
}>()

const user = useSupabaseUser()
const userId = useUserId()

const sheetOpen = ref(false)
const activeTab = ref<'feed' | 'mine'>('feed')
const sentinel = ref<HTMLElement | null>(null)
const mineSentinel = ref<HTMLElement | null>(null)

// Close sheet if user signs out mid-session
watch(user, (u) => {
  if (u == null)
    sheetOpen.value = false
})

const isMobile = useBreakpoint('<s')

// ── Carousel ──────────────────────────────────────────────────────────────

// Carousel shows everyone's activity except the current user's own posts.
const carouselPosts = computed<ActivityItem[]>(() => {
  if (userId.value == null)
    return props.latestPosts
  return props.latestPosts.filter(post => post.user !== userId.value)
})

// Boundary timestamp for the "since last visit" divider
const visitedAt = computed<number | null>(() => {
  if (props.lastVisitedAt == null)
    return null
  return new Date(props.lastVisitedAt).getTime()
})

const CAROUSEL_LIMIT = 16

// The slice of carousel posts actually rendered
const carouselSlice = computed<ActivityItem[]>(() => carouselPosts.value.slice(0, CAROUSEL_LIMIT))

// Index of the first carousel item older than the last visit, scoped to the
// rendered slice so the divider is never beyond what's visible.
const splitIndex = computed<number | null>(() => {
  if (visitedAt.value == null || props.loading)
    return null
  const idx = carouselSlice.value.findIndex(
    post => new Date(post.timestampRaw).getTime() <= visitedAt.value!,
  )
  if (idx <= 0 || idx >= carouselSlice.value.length)
    return null
  return idx
})

// New-since-last-visit count. Prefers the server-side count passed in via
// `postsSinceLastVisit` (accurate across the entire feed) and falls back to
// counting against the rendered carousel slice. The fallback is naturally
// bounded by `CAROUSEL_LIMIT` so it can undercount on busy forums - the
// server-side count exists specifically to avoid that.
const newSinceLastVisit = computed<number>(() => {
  if (visitedAt.value == null || user.value == null || props.loading)
    return 0
  if (props.postsSinceLastVisit != null)
    return props.postsSinceLastVisit
  return carouselSlice.value.filter(
    post => new Date(post.timestampRaw).getTime() > visitedAt.value!,
  ).length
})

// ── Paginated sheet feed - community tab (excludes current user) ───────────

const {
  items: sheetItems,
  mentionIds: sheetMentionIds,
  authorIds: sheetAuthorIds,
  loading: sheetLoading,
  loadingMore: sheetLoadingMore,
  exhausted: sheetExhausted,
  load: loadSheet,
  reload: reloadSheetFeed,
  loadMore,
} = useForumActivityFeedPaginated({
  ...props.feedOptions,
  excludeCurrentUser: true,
})

// ── Paginated sheet feed - my activity tab ─────────────────────────────────

const {
  items: mineItems,
  mentionIds: mineMentionIds,
  authorIds: mineAuthorIds,
  loading: mineLoading,
  loadingMore: mineLoadingMore,
  exhausted: mineExhausted,
  load: loadMine,
  loadMore: loadMoreMine,
} = useForumActivityFeedPaginated({
  ...props.feedOptions,
  createdByCurrentUser: true,
})

// Divider index for the community feed - same visit boundary logic
const sheetSplitIndex = computed<number | null>(() => {
  if (visitedAt.value == null || sheetLoading.value)
    return null
  const idx = sheetItems.value.findIndex(
    item => new Date(item.timestampRaw).getTime() <= visitedAt.value!,
  )
  if (idx <= 0 || idx >= sheetItems.value.length)
    return null
  return idx
})

// True when all loaded sheet items are newer than the visit boundary -
// meaning the divider belongs after the last visible item, not inline.
// Only show this trailing divider when there are actually new items to indicate.
const sheetTrailingDivider = computed<boolean>(() => {
  if (visitedAt.value == null || sheetLoading.value || sheetSplitIndex.value !== null)
    return false
  if (sheetItems.value.length === 0)
    return false
  // All items are newer than the visit boundary
  const allNewer = sheetItems.value.every(
    item => new Date(item.timestampRaw).getTime() > visitedAt.value!,
  )
  return allNewer && newSinceLastVisit.value > 0
})

// ── Mention / author cache ─────────────────────────────────────────────────

const sheetMentionIdsRef = computed(() => sheetMentionIds.value)
const mineMentionIdsRef = computed(() => mineMentionIds.value)

const { users: sheetMentionUsers } = useBulkDataUser(sheetMentionIdsRef, {
  includeAvatar: false,
  includeRole: false,
})
const { users: mineMentionUsers } = useBulkDataUser(mineMentionIdsRef, {
  includeAvatar: false,
  includeRole: false,
})

useBulkDataUser(sheetAuthorIds, { includeAvatar: true, includeRole: true })
useBulkDataUser(mineAuthorIds, { includeAvatar: true, includeRole: true })

const combinedMentionLookup = computed<Record<string, string>>(() => {
  const lookup: Record<string, string> = { ...props.mentionLookup }
  for (const [id, u] of sheetMentionUsers.value.entries())
    lookup[id] = u.username ?? id
  for (const [id, u] of mineMentionUsers.value.entries())
    lookup[id] = u.username ?? id
  return lookup
})

// ── Infinite scroll sentinels ──────────────────────────────────────────────

let observer: IntersectionObserver | null = null
let mineObserver: IntersectionObserver | null = null

function setupSentinelObserver(
  el: HTMLElement,
  onIntersect: () => void,
): IntersectionObserver {
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

async function ensureSheetLoaded() {
  if (sheetItems.value.length > 0)
    return

  await loadSheet()

  // Keep loading until we find an item older than the visit boundary
  if (visitedAt.value != null) {
    while (!sheetExhausted.value) {
      const idx = sheetItems.value.findIndex(
        item => new Date(item.timestampRaw).getTime() <= visitedAt.value!,
      )
      if (idx !== -1)
        break
      await loadMore()
    }
  }
}

async function ensureMineLoaded() {
  if (mineItems.value.length > 0 || mineExhausted.value)
    return
  await loadMine()
}

async function reloadSheet() {
  await reloadSheetFeed()
  emit('feedReloaded')

  if (visitedAt.value != null) {
    while (!sheetExhausted.value) {
      const idx = sheetItems.value.findIndex(
        item => new Date(item.timestampRaw).getTime() <= visitedAt.value!,
      )
      if (idx !== -1)
        break
      await loadMore()
    }
  }
}

// Re-attach sentinels when tab changes
watch(activeTab, async (tab) => {
  await nextTick()

  if (tab === 'feed') {
    mineObserver?.disconnect()
    mineObserver = null

    await ensureSheetLoaded()
    await nextTick()

    if (sentinel.value != null) {
      observer = setupSentinelObserver(sentinel.value, () => {
        if (!sheetLoadingMore.value && !sheetExhausted.value)
          void loadMore()
      })
    }
  }
  else {
    observer?.disconnect()
    observer = null

    await ensureMineLoaded()
    await nextTick()

    if (mineSentinel.value != null) {
      mineObserver = setupSentinelObserver(mineSentinel.value, () => {
        if (!mineLoadingMore.value && !mineExhausted.value)
          void loadMoreMine()
      })
    }
  }
})

watch(sheetOpen, async (open) => {
  if (!open) {
    observer?.disconnect()
    observer = null
    mineObserver?.disconnect()
    mineObserver = null
    activeTab.value = 'feed'
    return
  }

  await ensureSheetLoaded()
  await nextTick()

  if (sentinel.value != null) {
    observer = setupSentinelObserver(sentinel.value, () => {
      if (!sheetLoadingMore.value && !sheetExhausted.value)
        void loadMore()
    })
  }
})

onUnmounted(() => {
  observer?.disconnect()
  mineObserver?.disconnect()
})
</script>

<template>
  <section class="forum__latest">
    <Flex y-center x-start expand class="mb-s">
      <h5>
        Recent activity
      </h5>
      <Badge v-if="isMobile && newSinceLastVisit > 0" size="s" variant="accent">
        {{ newSinceLastVisit }} new
      </Badge>
      <Badge v-else-if="newSinceLastVisit > 0" variant="accent">
        {{ newSinceLastVisit }} since last visit
      </Badge>
      <Badge v-if="isMobile && !props.loading && props.postSinceYesterday" size="s" variant="neutral">
        {{ props.postSinceYesterday }}
      </Badge>
      <Badge v-else-if="!props.loading && props.postSinceYesterday" variant="neutral">
        {{ props.postSinceYesterday }} today
      </Badge>

      <div class="flex-1" />
      <Button v-if="user" size="s" outline @click="sheetOpen = !sheetOpen">
        See more
        <template #end>
          <Icon name="ph:caret-up-down" />
        </template>
      </Button>
    </Flex>

    <Carousel gap="s">
      <template v-if="props.loading">
        <div v-for="item in 4" :key="item" class="forum__latest-skeleton">
          <Flex x-between y-center expand>
            <Flex :gap="4" y-center>
              <Skeleton width="96px" height="15px" />
              <Skeleton width="64px" height="15px" />
            </Flex>
            <Skeleton width="40px" height="15px" />
          </Flex>
          <Skeleton width="45%" height="24px" />
          <Flex y-center x-start expand style="margin-top: auto; width: 100%;">
            <Skeleton circle width="28px" height="28px" />
            <Skeleton width="80px" height="16px" />
          </Flex>
        </div>
      </template>

      <template v-else>
        <template v-for="(post, index) in carouselSlice" :key="post.id">
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
            :mention-lookup="props.mentionLookup"
          />
        </template>
      </template>
    </Carousel>

    <Sheet v-if="user" :open="sheetOpen" :size="456" @close="sheetOpen = false">
      <template #header>
        <Flex y-center x-between expand class="mb-s">
          <h4>
            Recent activity
          </h4>
          <Button
            v-if="activeTab === 'feed' && (props.feedPendingCount ?? 0) > 0"
            size="s"
            variant="accent"
            outline
            @click="reloadSheet"
          >
            <template #start>
              <Icon name="ph:arrow-counter-clockwise" />
            </template>
            {{ props.feedPendingCount }} new
          </Button>
        </Flex>

        <Tabs v-model="activeTab" class="forum__latest-sheet-tabs">
          <Tab value="feed">
            Feed
          </Tab>
          <Tab value="mine">
            My Activity
          </Tab>
        </Tabs>
      </template>

      <!-- Community feed tab -->
      <Flex v-if="activeTab === 'feed'" column gap="m" class="pt-s">
        <template v-if="sheetLoading">
          <Skeleton v-for="i in 6" :key="i" width="100%" height="96px" />
        </template>

        <template v-else>
          <template v-for="(post, index) in sheetItems" :key="post.id">
            <Tooltip v-if="sheetSplitIndex !== null && index === sheetSplitIndex" :disabled="isMobile">
              <div class="forum__latest-divider forum__latest-divider--sheet">
                <Icon name="ph:clock" :size="16" />
              </div>
              <template #tooltip>
                <p>You've caught up</p>
              </template>
            </Tooltip>
            <ForumLatestItem
              :post="post"
              :mention-lookup="combinedMentionLookup"
              expand
            />
          </template>

          <Tooltip v-if="sheetTrailingDivider" :disabled="isMobile">
            <div class="forum__latest-divider forum__latest-divider--sheet">
              <Icon name="ph:clock" :size="16" />
            </div>
            <template #tooltip>
              <p>Older posts start here</p>
            </template>
          </Tooltip>

          <div ref="sentinel" class="forum__latest-sentinel">
            <Spinner v-if="sheetLoadingMore" />
            <span v-else-if="sheetExhausted" class="text-xs text-color-lighter">All caught up</span>
          </div>
        </template>
      </Flex>

      <!-- My activity tab -->
      <Flex v-else-if="activeTab === 'mine'" column gap="m" class="pt-s">
        <template v-if="mineLoading">
          <Skeleton v-for="i in 6" :key="i" width="100%" height="96px" />
        </template>

        <template v-else-if="!mineLoading && mineItems.length === 0 && mineExhausted">
          <Flex column x-center y-center class="forum__latest-empty">
            <Icon name="ph:pencil-slash" :size="32" />
            <p>Nothing posted yet</p>
          </Flex>
        </template>

        <template v-else>
          <ForumLatestItem
            v-for="post in mineItems"
            :key="post.id"
            :post="post"
            :mention-lookup="combinedMentionLookup"
            expand
          />

          <div ref="mineSentinel" class="forum__latest-sentinel">
            <Spinner v-if="mineLoadingMore" />
            <span v-else-if="mineExhausted" class="text-xs text-color-lighter">That's everything</span>
          </div>
        </template>
      </Flex>
    </Sheet>
  </section>
</template>

<style lang="scss" scoped>
.forum__latest {
  margin-bottom: var(--space-xl);
}

.forum__latest-sentinel {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: var(--space-m) 0;
  min-height: 48px;
}

:deep(.overflow.is-horizontal .overflow-content > *) {
  min-width: 320px;
  width: 320px;
  max-width: 320px;
}

.forum__latest-skeleton {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-xs);
  padding: var(--space-s);
  border-radius: var(--border-radius-m);
  border: 1px solid var(--color-border);
  width: 320px;
  min-width: 320px;
  max-width: 320px;
  overflow: hidden;
  align-self: stretch;
  background-color: var(--color-bg-medium);
}

@media screen and (max-width: 480px) {
  .forum__latest-skeleton {
    min-width: 256px;
  }
}

.forum__latest-divider {
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  align-self: stretch;
  position: relative;
  flex-shrink: 0;
  width: 2px;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--border-radius-pill);
  margin-inline: 4px;
  z-index: 1;

  &:after {
    content: '';
    z-index: -1;
    position: absolute;
    top: 50%;
    left: 50%;
    width: 3px;
    height: 32px;
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

  &--sheet {
    width: 100%;
    flex-direction: row;
    align-self: unset;

    &:after {
      height: 3px;
      width: 34px;
    }
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
