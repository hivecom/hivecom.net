<script setup lang="ts">
import type { ActivityItem } from '@/composables/useForumActivityFeed'
import { Flex } from '@dolanske/vui'
import MarkdownPreview from '@/components/Shared/MarkdownPreview.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import UserName from '@/components/Shared/UserName.vue'
import { useNow } from '@/composables/useNow'
import { fromNow } from '@/lib/utils/date'

const props = defineProps<{
  post: ActivityItem
  mentionLookup: Record<string, string>
}>()

const { now } = useNow(() => props.post.timestampRaw)

// The item's own `timestamp` is baked at fetch time and never ages, so this
// re-derives off the shared tick
const timeLabel = computed(() => fromNow(props.post.timestampRaw, now.value, 'narrow'))
</script>

<template>
  <NuxtLink
    class="forum__latest-item"
    :to="props.post.href ?? ''"
    :draggable="false"
  >
    <strong class="forum__latest-title">
      <MarkdownPreview v-if="post.type === 'Reply'" :markdown="post.title" :mention-lookup="props.mentionLookup" />
      <template v-else>{{ post.title }}</template>
    </strong>
    <Flex y-center x-between gap="s" class="forum__latest-footer" expand @click.stop>
      <Flex y-center gap="xs" class="forum__latest-user">
        <UserAvatar :user-id="post.user" :size="18" linked show-preview />
        <UserName :user-id="post.user" inherit show-preview />
        <span class="forum__latest-time">{{ timeLabel }}</span>
      </Flex>

      <span v-if="post.type === 'Reply'" class="forum__latest-thread">
        <Icon name="ph:arrow-bend-up-left" :size="12" class="forum__latest-thread-icon" />
        <span class="forum__latest-thread-name">{{ post.typeContext }}</span>
      </span>
      <span v-else class="forum__latest-type">
        <Icon name="ph:plus" :size="12" class="forum__latest-thread-icon" />
        {{ post.typeLabel ?? post.type }}
      </span>
    </Flex>
  </NuxtLink>
</template>

<style lang="scss" scoped>
@use '@/assets/mixins.scss' as *;

.forum__latest-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-xxs);
  padding: var(--space-xs);
  // Bleeds over the section padding so the hover fill runs to the card edge
  margin-inline: calc(var(--space-xs) * -1);
  border-bottom: 1px solid var(--color-border-weak);
  overflow: hidden;
  cursor: pointer;
  text-decoration: none;
  align-self: stretch;
  transition: background-color var(--transition-duration) ease;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background-color: var(--color-bg-medium);
  }

  span {
    white-space: nowrap;
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
  }
}

.forum__latest-type {
  flex: 0 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--space-xxs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

// Qualified by the row class, or the blanket `span` rule above out-specifies the colour
.forum__latest-item .forum__latest-thread {
  flex: 0 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--space-xxs);
  color: var(--color-text-lightest);
}

.forum__latest-thread-icon {
  flex-shrink: 0;
}

.forum__latest-item .forum__latest-thread-name {
  min-width: 0;
  color: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.forum__latest-item .forum__latest-time {
  flex-shrink: 0;
  color: var(--color-text-lighter);
  font-weight: var(--font-weight-regular);
}

.forum__latest-user {
  flex: 0 1 auto;
  min-width: 0;
  // A long name can't crowd the thread out
  max-width: 66%;
  overflow: hidden;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);

  > :first-child {
    flex-shrink: 0;
  }

  // UserName wraps by default and has no truncation of its own
  :deep(.user-name) {
    min-width: 0;
    flex-wrap: nowrap;
  }

  :deep(.user-name__link) {
    min-width: 0;
    overflow: hidden;
  }

  :deep(.user-name__text) {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.forum__latest-title {
  display: block;
  width: 100%;
  max-width: 100%;
  text-align: left;
  font-size: var(--font-size-xs);
  color: var(--color-text);
  @include line-clamp(2);

  // MarkdownPreview's root is a <p>, and the VUI reset sets `span, strong, p` to
  // --font-size-m instead of inheriting
  p {
    font-size: inherit;
    @include line-clamp(2);
  }
}
</style>
