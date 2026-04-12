<script setup lang="ts">
import type { ActivityItem } from '@/composables/useForumActivityFeed'
import type { UseForumActivityFeedPaginatedOptions } from '@/composables/useForumActivityFeedPaginated'
import { Badge, Button, Carousel, Flex, Sheet, Skeleton, Spinner, Tooltip } from '@dolanske/vui'
import ForumLatestItem from '@/components/Forum/ForumLatestItem.vue'
import TinyBadge from '@/components/Shared/TinyBadge.vue'
import { useBulkDataUser } from '@/composables/useDataUser'
import { useForumActivityFeedPaginated } from '@/composables/useForumActivityFeedPaginated'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  loading: boolean
  latestPosts: ActivityItem[]
  postSinceYesterday: number
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

const sheetOpen = ref(false)
const sentinel = ref<HTMLElement | null>(null)

// Close sheet if user signs out mid-session
watch(user, (u) => {
  if (u == null)
    sheetOpen.value = false
})

const isMobile = useBreakpoint('<s')

// ── Carousel divider ───────────────────────────────────────────────────────

// Shared boundary timestamp used by both the carousel and sheet split indexes.
const visitedAt = computed<number | null>(() => {
  if (props.lastVisitedAt == null)
    return null
  return new Date(props.lastVisitedAt).getTime()
})

// Advance the effective visit time to cover any posts by the current user -
// they obviously saw their own post when they wrote it, so it should never
// appear in the "new since last visit" zone.
const effectiveVisitedAt = computed<number | null>(() => {
  if (visitedAt.value == null)
    return null
  // If the user isn't hydrated yet, don't try to advance the boundary -
  // we can't reliably identify own posts without an ID.
  if (user.value == null)
    return visitedAt.value
  const ownPosts = props.latestPosts.filter(post => post.user === user.value!.id)
  if (ownPosts.length === 0)
    return visitedAt.value
  const latestOwn = Math.max(...ownPosts.map(p => new Date(p.timestampRaw).getTime()))
  return Math.max(visitedAt.value, latestOwn)
})

// Index of the first item older than the last visit - divider renders between
// index (splitIndex - 1) and index splitIndex.
const splitIndex = computed<number | null>(() => {
  if (effectiveVisitedAt.value == null || props.loading)
    return null
  const idx = props.latestPosts.findIndex(
    post => new Date(post.timestampRaw).getTime() <= effectiveVisitedAt.value!,
  )
  // No divider if everything is new or nothing is new
  if (idx <= 0 || idx >= props.latestPosts.length)
    return null
  return idx
})

// Exclude the current user's own posts from the "new" count - they don't need
// to see their own activity flagged as unseen.
const newSinceLastVisit = computed<number>(() => {
  if (splitIndex.value == null)
    return 0
  // If the user isn't hydrated yet, don't count anything as new - we can't
  // filter out own posts and would over-count.
  if (user.value == null)
    return 0
  return props.latestPosts
    .slice(0, splitIndex.value)
    .filter(post => post.user !== user.value!.id)
    .length
})

// ── Paginated sheet feed ───────────────────────────────────────────────────

const {
  items: sheetItems,
  mentionIds: sheetMentionIds,
  authorIds: sheetAuthorIds,
  loading: sheetLoading,
  loadingMore: sheetLoadingMore,
  exhausted: sheetExhausted,
  load: loadSheet,
  loadMore,
} = useForumActivityFeedPaginated(props.feedOptions)

// Divider index in the sheet feed - same logic as carousel, same boundary.
const sheetSplitIndex = computed<number | null>(() => {
  if (effectiveVisitedAt.value == null || sheetLoading.value)
    return null
  const idx = sheetItems.value.findIndex(
    item => new Date(item.timestampRaw).getTime() <= effectiveVisitedAt.value!,
  )
  if (idx <= 0 || idx >= sheetItems.value.length)
    return null
  return idx
})

// Pre-warm mention and author caches for sheet items
const sheetMentionIdsRef = computed(() => sheetMentionIds.value)
const { users: sheetMentionUsers } = useBulkDataUser(sheetMentionIdsRef, {
  includeAvatar: false,
  includeRole: false,
})
useBulkDataUser(sheetAuthorIds, {
  includeAvatar: true,
  includeRole: true,
})

const sheetMentionLookup = computed<Record<string, string>>(() => {
  const lookup: Record<string, string> = {}
  for (const [id, u] of sheetMentionUsers.value.entries())
    lookup[id] = u.username ?? id
  return lookup
})

// Also extract mentions from props.mentionLookup for items that are in both
// feeds (carousel items reuse the parent's mention lookup)
const combinedMentionLookup = computed<Record<string, string>>(() => ({
  ...props.mentionLookup,
  ...sheetMentionLookup.value,
}))

// Load sheet data on first open, set up IntersectionObserver for infinite scroll
let observer: IntersectionObserver | null = null

async function reloadSheet() {
  await loadSheet()
  emit('feedReloaded')

  if (effectiveVisitedAt.value != null) {
    while (!sheetExhausted.value) {
      const idx = sheetItems.value.findIndex(
        item => new Date(item.timestampRaw).getTime() <= effectiveVisitedAt.value!,
      )
      if (idx !== -1)
        break
      await loadMore()
    }
  }
}

watch(sheetOpen, async (open) => {
  if (!open) {
    observer?.disconnect()
    observer = null
    return
  }

  // First open - fetch initial page
  if (sheetItems.value.length === 0) {
    await loadSheet()

    // If lastVisitedAt is set but no boundary item was found in the first page
    // (findIndex === -1 means all loaded items are newer), keep loading pages
    // until we find an item older than the last visit or exhaust the feed.
    if (effectiveVisitedAt.value != null) {
      while (!sheetExhausted.value) {
        const idx = sheetItems.value.findIndex(
          item => new Date(item.timestampRaw).getTime() <= effectiveVisitedAt.value!,
        )
        if (idx !== -1)
          break
        await loadMore()
      }
    }
  }

  // Set up sentinel observer after DOM settles
  await nextTick()
  if (sentinel.value == null)
    return

  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && !sheetLoadingMore.value && !sheetExhausted.value)
        void loadMore()
    },
    { threshold: 0.1 },
  )
  observer.observe(sentinel.value)
})

onUnmounted(() => {
  observer?.disconnect()
})
</script>

<template>
  <section class="forum__latest">
    <Flex y-center x-start expand class="mb-s">
      <h5>
        Latest activity
      </h5>
      <TinyBadge v-if="isMobile && newSinceLastVisit > 0" variant="accent">
        {{ newSinceLastVisit }} new
      </TinyBadge>
      <Badge v-else-if="newSinceLastVisit > 0" variant="accent">
        {{ newSinceLastVisit }} since last visit
      </Badge>
      <TinyBadge v-if="isMobile && !props.loading && props.postSinceYesterday" variant="neutral">
        {{ props.postSinceYesterday }}
      </TinyBadge>
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

    <Carousel gap="s" :sheet-width="512" auto-adjust>
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
        <template v-for="(post, index) in props.latestPosts.slice(0, 16)" :key="post.id">
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
        <Flex y-center x-between expand>
          <h4>
            Latest activity
          </h4>
          <Button
            v-if="(props.feedPendingCount ?? 0) > 0"
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
      </template>

      <Flex column gap="m">
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

          <!-- Infinite scroll sentinel -->
          <div ref="sentinel" class="forum__latest-sentinel">
            <Flex v-if="sheetLoadingMore" expand x-center>
              <Spinner />
            </Flex>
            <span v-else-if="sheetExhausted" class="forum__latest-exhausted">
              All caught up
            </span>
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
  border-radius: 999px;
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

.forum__latest-sentinel {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: var(--space-m) 0;
  min-height: 48px;
}

.forum__latest-exhausted {
  font-size: var(--font-size-xs);
  color: var(--color-text-lighter);
}
</style>
