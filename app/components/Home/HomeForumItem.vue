<script setup lang="ts">
import type { ActivityItem } from '@/composables/useForumActivityFeed'
import { Divider, Flex } from '@dolanske/vui'
import MarkdownPreview from '@/components/Shared/MarkdownPreview.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import GlowCard from '../Shared/GlowCard.vue'

const props = defineProps<{
  post: ActivityItem
  mentionLookup: Record<string, string>
}>()
</script>

<template>
  <GlowCard no-glow>
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
        <UserDisplay
          :user-id="post.user"
          size="s"
        />
        <Divider vertical :height="16" />
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
  </GlowCard>
</template>

<style lang="scss" scoped>
@use '@/assets/mixins.scss' as *;

.forum__latest-item {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-xs);
  padding: var(--space-s);
  border-radius: var(--border-radius-m);
  border: 1px solid var(--color-border);
  overflow: hidden;
  cursor: pointer;
  text-decoration: none;
  align-self: stretch;
  background-color: var(--color-bg);

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
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-bold);
  }
}

.forum__latest-title {
  display: block;
  width: 100%;
  max-width: 100%;
  text-align: left;
  font-size: var(--font-size-m);
  color: var(--color-text);
  @include line-clamp(2);

  p {
    @include line-clamp(2);
  }
}
</style>
