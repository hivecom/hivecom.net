<script setup lang="ts">
import { Flex, Skeleton } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'
import DiscussionReplyCardSkeleton from '../Discussions/DiscussionReplyCardSkeleton.vue'
import DiscussionToolbarSkeleton from '../Discussions/DiscussionToolbarSkeleton.vue'

const isMobile = useBreakpoint('<m')
</script>

<template>
  <div class="forum-post-skeleton">
    <!-- Breadcrumbs / back row -->
    <Flex y-center gap="xs" class="mb-xl">
      <Skeleton :width="256" :height="28" :radius="8" />

      <Flex expand />

      <Skeleton :width="92" :height="32" :radius="8" />
      <Skeleton :width="92" :height="32" :radius="8" />
      <Skeleton :width="32" :height="32" :radius="8" />
      <Skeleton :width="84" :height="32" :radius="8" />
    </Flex>

    <!-- Title -->
    <Skeleton :width="isMobile ? 240 : 460" :height="44" :radius="8" class="mb-m" />

    <!-- Description -->
    <Skeleton class="mb-l forum-post-skeleton__full" :height="18" :radius="4" style="max-width: 560px;" />

    <!-- Author row -->
    <Flex y-center x-between wrap gap="m" class="mb-xl">
      <Flex y-center gap="s">
        <Skeleton :width="44" :height="44" style="border-radius: var(--border-radius-pill);" />
        <Flex column gap="xs">
          <Flex y-center gap="s">
            <Skeleton :width="128" :height="14" :radius="4" />
            <Skeleton :width="48" :height="20" :radius="12" />
          </Flex>
        </Flex>
      </Flex>
      <Skeleton :width="isMobile ? 320 : 256" :height="24" :radius="12" />
    </Flex>

    <!-- Post body content area -->
    <section class="forum-post-skeleton__body mb-xl">
      <Skeleton class="forum-post-skeleton__full" :height="400" :radius="8" />
    </section>

    <!-- Toolbar -->
    <DiscussionToolbarSkeleton is-forum />

    <!-- Reply cards -->
    <Flex column gap="m" expand>
      <DiscussionReplyCardSkeleton v-for="n in 3" :key="n" />
    </Flex>
  </div>
</template>

<style lang="scss" scoped>
.forum-post-skeleton {
  padding-top: var(--space-xl);

  &__full {
    width: 100%;
  }

  &__body {
    width: 100%;
  }
}
</style>
