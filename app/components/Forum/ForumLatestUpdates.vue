<script setup lang="ts">
import type { ActivityItem } from '@/composables/useForumActivityFeed'
import { Badge, Button, Carousel, Flex, Sheet, Skeleton } from '@dolanske/vui'
import ForumLatestItem from '@/components/Forum/ForumLatestItem.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  loading: boolean
  latestPosts: ActivityItem[]
  postSinceYesterday: number
  lastVisitedAt: string | null
  mentionLookup: Record<string, string>
}>()

const sheetOpen = ref(false)

const isMobile = useBreakpoint('<s')

// Index of the first item that is older than the last visit - the divider
// renders between index (splitIndex - 1) and index splitIndex.
const splitIndex = computed<number | null>(() => {
  if (props.lastVisitedAt == null || props.loading)
    return null
  const visitedAt = new Date(props.lastVisitedAt).getTime()
  const idx = props.latestPosts.findIndex(
    post => new Date(post.timestampRaw).getTime() <= visitedAt,
  )
  // No divider if everything is new or nothing is new
  if (idx <= 0 || idx >= props.latestPosts.length)
    return null
  return idx
})

const newSinceLastVisit = computed<number>(() => {
  if (splitIndex.value == null)
    return 0
  return splitIndex.value
})
</script>

<template>
  <section class="forum__latest">
    <Flex y-center x-start expand class="mb-s">
      <h5>
        Latest updates
      </h5>
      <Badge v-if="newSinceLastVisit > 0" variant="accent">
        {{ newSinceLastVisit }} since last visit
      </Badge>
      <Badge v-if="props.postSinceYesterday" variant="neutral">
        {{ props.postSinceYesterday }} {{ isMobile ? null : 'today' }}
      </Badge>

      <div class="flex-1" />
      <Button size="s" outline @click="sheetOpen = !sheetOpen">
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
          <div v-if="splitIndex !== null && index === splitIndex" class="forum__latest-divider">
            <span class="text-color-accent">Last visited</span>
          </div>
          <ForumLatestItem
            :post="post"
            :mention-lookup="props.mentionLookup"
          />
        </template>
      </template>
    </Carousel>

    <Sheet :open="sheetOpen" :size="456" @close="sheetOpen = false">
      <template #header>
        <h4 class="pt-xxs">
          Latest updates
        </h4>
      </template>

      <Flex column gap="m">
        <template v-for="(post, index) in props.latestPosts.slice(0, 65)" :key="post.id">
          <div v-if="splitIndex !== null && index === splitIndex" class="forum__latest-divider forum__latest-divider--sheet">
            <span class="text-color-accent">Last visited</span>
          </div>
          <ForumLatestItem
            :post="post"
            :mention-lookup="props.mentionLookup"
            expand
          />
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
  width: 1px;
  background-color: var(--color-accent);
  border-radius: 999px;

  span {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-90deg);
    white-space: nowrap;
    font-size: var(--font-size-xxs);
    color: var(--color-text-lighter);
    background-color: var(--color-bg);
    padding: 0 var(--space-xxs);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  &--sheet {
    width: 100%;
    height: 1px;
    flex-direction: row;
    align-self: unset;

    span {
      transform: translate(-50%, -50%);
      background-color: var(--color-bg-medium);
    }
  }
}
</style>
