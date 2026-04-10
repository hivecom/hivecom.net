<script setup lang="ts">
import type { ActivityItem } from '@/composables/useForumActivityFeed'
import { Flex, Tooltip } from '@dolanske/vui'
import MarkdownPreview from '@/components/Shared/MarkdownPreview.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'

const props = defineProps<{
  post: ActivityItem
  mentionLookup: Record<string, string>
  expand?: boolean
  hideUser?: boolean
  variant?: 'default' | 'compact'
}>()

function handleClick() {
  if (props.post.onClick) {
    props.post.onClick()
    return
  }
  if (props.post.href) {
    navigateTo(props.post.href)
  }
}
</script>

<template>
  <div
    class="forum__latest-item"
    :class="{
      'forum__latest-item--expand': props.expand,
      'forum__latest-item--compact': props.variant === 'compact',
    }"
    :draggable="false"
    @click="handleClick"
  >
    <Flex x-between y-center expand>
      <Flex :gap="4" y-center>
        <Icon :name="post.icon" :size="13" />
        <span class="forum__latest-type">
          <template v-if="post.type === 'Reply'">
            {{ post.typeLabel }} <strong>{{ post.typeContext }}</strong>
          </template>
          <template v-else>
            {{ post.typeLabel ?? post.type }}
          </template>
        </span>
      </Flex>
      <Tooltip placement="top">
        <span class="forum__latest-timestamp">{{ post.timestamp }}</span>
        <template #tooltip>
          <TimestampDate :date="post.timestampRaw" :tooltip="false" format="YYYY-MM-DD HH:mm:ss" size="xs" />
        </template>
      </Tooltip>
    </Flex>
    <strong class="forum__latest-title" :class="{ 'forum__latest-title--compact': props.variant === 'compact' }">
      <MarkdownPreview v-if="post.type === 'Reply'" :markdown="post.title" :mention-lookup="props.mentionLookup" />
      <template v-else>{{ post.title }}</template>
    </strong>
    <Flex v-if="!props.hideUser" y-center x-between expand class="forum__latest-footer" @click.stop>
      <UserDisplay
        :user-id="post.user"
        size="s"
        show-role
      />
    </Flex>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/mixins.scss' as *;
@use '@/assets/breakpoints.scss' as *;

.forum__latest-item {
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
  cursor: pointer;
  text-decoration: none;
  align-self: stretch;
  background-color: var(--color-bg-medium);

  &--expand {
    width: 100%;
    min-width: unset;
    max-width: unset;

    .forum__latest-title {
      @include line-clamp(2);

      p {
        @include line-clamp(2);
      }
    }
  }

  &--compact {
    border: none;
    background-color: transparent;
    padding: var(--space-xs) var(--space-xxs);
    border-radius: var(--border-radius-s);

    .markdown-preview {
      font-size: var(--font-size-s);
    }

    &:hover {
      background-color: var(--color-bg-raised);
    }
  }

  &:not(&--compact):hover {
    background-color: var(--color-bg-raised);
  }

  & > :deep(.vui-flex) {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
  }

  & > :deep(.vui-flex > .vui-flex) {
    flex: 1;
    min-width: 0;
    overflow: hidden;
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
  @include line-clamp(1);

  p {
    @include line-clamp(1);
  }

  &--compact {
    font-size: var(--font-size-s);
  }
}

.forum__latest-footer {
  width: 100%;
  margin-top: auto;
}

.forum__latest-timestamp {
  font-size: var(--font-size-xs);
  color: var(--color-text-lighter);
}

@media screen and (max-width: $breakpoint-s) {
  .forum__latest-item {
    min-width: 256px;
  }
}
</style>
