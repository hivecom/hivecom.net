<script setup lang="ts">
import type { ActivityItem } from '@/composables/useForumActivityFeed'
import { Badge, Button, Carousel, Flex, Sheet, Skeleton } from '@dolanske/vui'
import ForumLatestItem from '@/components/Forum/ForumLatestItem.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  loading: boolean
  latestPosts: ActivityItem[]
  postSinceYesterday: number
  mentionLookup: Record<string, string>
}>()

const sheetOpen = ref(false)

const isMobile = useBreakpoint('<s')
</script>

<template>
  <section class="forum__latest">
    <Flex y-center x-start expand class="mb-s">
      <h5>
        Latest updates
      </h5>
      <Badge v-if="props.postSinceYesterday" variant="accent">
        {{ props.postSinceYesterday }} {{ isMobile ? null : 'today' }}
      </Badge>

      <div class="flex-1" />
      <Button size="s" @click="sheetOpen = !sheetOpen">
        View all
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
        <ForumLatestItem
          v-for="post in props.latestPosts.slice(0, 20)"
          :key="post.id"
          :post="post"
          :mention-lookup="props.mentionLookup"
        />
      </template>
    </Carousel>

    <Sheet :open="sheetOpen" :size="456" @close="sheetOpen = false">
      <template #header>
        <h4 class="pt-xxs">
          Latest updates
        </h4>
      </template>

      <Flex column gap="m">
        <ForumLatestItem
          v-for="post in props.latestPosts.slice(0, 75)"
          :key="post.id"
          :post="post"
          :mention-lookup="props.mentionLookup"
          expand
        />
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
</style>
