<script setup lang="ts">
import type { UserActivityItem } from '@/composables/useForumUserActivity'
import { Badge, Carousel, Flex, Skeleton } from '@dolanske/vui'

const props = defineProps<{
  loading: boolean
  items: UserActivityItem[]
  topicLookup: Map<string, string>
}>()
const skeletonWidths = ['120px', '90px', '140px', '100px', '80px', '110px']
</script>

<template>
  <section class="forum__continue">
    <h5 class="mb-s">
      Pick up where you left off
    </h5>

    <Carousel v-if="props.loading" gap="xs" hide-scrollbar>
      <Flex>
        <Skeleton v-for="item in 9" :key="item" height="38px" :width="skeletonWidths[(item - 1) % skeletonWidths.length]" radius="100" />
      </Flex>
    </Carousel>

    <Carousel v-else-if="props.items.length > 0" :gap="8" hide-scrollbar>
      <NuxtLink v-for="item in props.items" :key="item.id" :to="item.discussionHref" class="forum__continue--item" :draggable="false">
        <Badge variant="neutral" class="ws-nowrap">
          {{ item.discussionTitle }}
        </Badge>
      </NuxtLink>
    </Carousel>
  </section>
</template>

<style scoped lang="scss">
@use '@/assets/breakpoints.scss' as *;
@use '@/assets/mixins.scss' as *;

.forum__continue {
  margin-bottom: var(--space-xl);

  &--item {
    .vui-badge {
      --vui-badge-padding-inline: 14px !important;
      --vui-badge-padding-block: 9px !important;
      --vui-badge-font-size: var(--font-size-m);
    }

    &:hover .vui-badge {
      background-color: var(--color-button-gray-hover) !important;
    }
  }
}
</style>
