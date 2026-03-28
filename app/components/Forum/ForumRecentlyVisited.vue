<script setup lang="ts">
import type { UserActivityItem } from '@/composables/useForumUserActivity'
import { Badge, Carousel, Skeleton } from '@dolanske/vui'

const props = defineProps<{
  loading: boolean
  items: UserActivityItem[]
  topicLookup: Map<string, string>
}>()
</script>

<template>
  <section class="forum__continue">
    <h5 class="mb-s">
      Recently viewed
    </h5>

    <!-- <Card> -->
    <ul v-if="props.loading" class="forum__continue-list">
      <li v-for="item in 6" :key="item">
        <Skeleton :height="40" width="100%" />
      </li>
    </ul>

    <Carousel v-else-if="props.items.length > 0" gap="xs">
      <NuxtLink v-for="item in props.items" :key="item.id" :to="item.discussionHref" class="forum__continue--item">
        <Badge variant="neutral" class="ws-nowrap">
          {{ item.discussionTitle }}
        </Badge>
      </NuxtLink>
    </Carousel>
    <!-- </Card> -->
  </section>
</template>

<style scoped lang="scss">
@use '@/assets/breakpoints.scss' as *;
@use '@/assets/mixins.scss' as *;

.forum__continue {
  margin-bottom: var(--space-xl);

  &--title {
    display: block;
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-light);
    margin-bottom: var(--space-xs);
  }

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

  /* &--list {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-start;
    max-width: 892px;
    gap: var(--space-xs);
    list-style: none;
  } */
}
</style>
