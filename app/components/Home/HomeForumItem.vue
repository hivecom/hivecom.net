<script setup lang="ts">
import type { ActivityItem } from '@/composables/useForumActivityFeed'
import { Divider, Flex } from '@dolanske/vui'
import MarkdownPreview from '@/components/Shared/MarkdownPreview.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import UserName from '@/components/Shared/UserName.vue'

const props = defineProps<{
  post: ActivityItem
  mentionLookup: Record<string, string>
}>()
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
    <Flex y-center x-between class="forum__latest-footer" expand @click.stop>
      <Flex y-center gap="xs" class="forum__latest-user">
        <UserAvatar :user-id="post.user" :size="18" linked show-preview />
        <UserName :user-id="post.user" inherit show-preview />
      </Flex>
      <Divider vertical :height="12" />
      <span class="forum__latest-type">
        <template v-if="post.type === 'Reply'">
          {{ post.typeLabel }} <strong>{{ post.typeContext }}</strong>
        </template>
        <template v-else>
          {{ post.typeLabel ?? post.type }}
        </template>
      </span>
    </Flex>
  </NuxtLink>
</template>

<style lang="scss" scoped>
@use '@/assets/mixins.scss' as *;

// A list, not a stack of cards. The rows carry no outline of their own, so the
// hairline does the separating and the hover fill does the "this is a target".
.forum__latest-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-xxs);
  padding: var(--space-xs);
  // Bleed back out over the section padding so the rows and the hover fill run
  // to the card edge instead of sitting indented under the label.
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
  flex: 1;
  min-width: 0;
  display: block;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  strong {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
  }
}

// The name sits at the same weight and size as the rest of the footer, so
// UserName inherits instead of carrying its own scale.
.forum__latest-user {
  min-width: 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}

.forum__latest-title {
  display: block;
  width: 100%;
  max-width: 100%;
  text-align: left;
  // Same size as the footer - the bold weight and the brighter colour carry the
  // hierarchy, so the message doesn't need the extra couple of pixels.
  font-size: var(--font-size-xs);
  color: var(--color-text);
  @include line-clamp(2);

  // MarkdownPreview's root is a <p>, and the VUI reset sets `span, strong, p`
  // to --font-size-m outright, so it takes the reset instead of inheriting the
  // size off this strong. Hand it back.
  p {
    font-size: inherit;
    @include line-clamp(2);
  }
}
</style>
