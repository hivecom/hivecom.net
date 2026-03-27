<script setup lang="ts">
import type { ActivityItem } from '@/composables/useForumActivityFeed'
import { Badge, Carousel, Flex, Skeleton } from '@dolanske/vui'
import MarkdownPreview from '@/components/Shared/MarkdownPreview.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'

const props = defineProps<{
  loading: boolean
  latestPosts: ActivityItem[]
  postSinceYesterday: number
  mentionLookup: Record<string, string>
}>()

function handlePostClick(event: MouseEvent, post: ActivityItem) {
  if (post.onClick) {
    event.preventDefault()
    post.onClick()
  }
}
</script>

<template>
  <section class="forum__latest">
    <Carousel gap="s" :sheet-width="512" auto-adjust>
      <template #header>
        <Flex y-center x-start expand class="mb-s">
          <h5>
            Latest updates
          </h5>
          <Badge v-if="props.postSinceYesterday" variant="accent">
            {{ props.postSinceYesterday }} today
          </Badge>

          <!-- <div class="flex-1" />
          <Button size="s" @click="toggle">
            View all
          </Button> -->
        </Flex>
      </template>
      <template v-if="props.loading">
        <div v-for="item in 4" :key="item" class="forum__latest-item">
          <Flex x-between y-center expand>
            <Flex :gap="4" y-center>
              <Skeleton width="96px" height="15px" />
              <Skeleton width="64px" height="15px" />
            </Flex>
            <Skeleton width="40px" height="15px" />
          </Flex>
          <Skeleton class="forum__latest-title" width="45%" height="24px" />
          <Flex y-center x-start expand class="forum__latest-footer">
            <Skeleton circle width="28px" height="28px" />
            <Skeleton width="80px" height="16px" />
          </Flex>
        </div>
      </template>

      <template v-else>
        <NuxtLink
          v-for="post in props.latestPosts"
          :key="post.id"
          class="forum__latest-item"
          :href="post.href"
          :draggable="false"
          @click="handlePostClick($event, post)"
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
            <span class="forum__latest-timestamp">{{ post.timestamp }}</span>
          </Flex>
          <strong class="forum__latest-title">
            <MarkdownPreview v-if="post.type === 'Reply'" :markdown="post.title" :mention-lookup="props.mentionLookup" />
            <template v-else>{{ post.title }}</template>
          </strong>
          <!-- <p v-if="post.description" class="forum__latest-description">
            {{ stripMarkdown(processMentionsToText(post.description, props.mentionLookup)) }}
          </p> -->
          <Flex y-center x-between expand class="forum__latest-footer">
            <UserDisplay
              :user-id="post.user"
              size="s"
              show-role
            />
          </Flex>
        </NuxtLink>
      </template>
    </Carousel>
  </section>
</template>

<style lang="scss" scoped>
@use '@/assets/mixins.scss' as *;

.forum__latest {
  margin-bottom: var(--space-s);
}

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

  &:first-child {
    background-color: var(--color-bg-medium);

    &:hover {
      background-color: var(--color-bg-raised);
    }
  }

  &:hover {
    background-color: var(--color-bg-medium);
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
    line-height: 1.2;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
  line-height: 1.2;

  :deep(p) {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.forum__latest-description {
  @include line-clamp(1);
  text-align: left;
  font-size: var(--font-size-s);
  color: var(--color-text-lighter);
  margin-top: 2px;
  margin-bottom: var(--space-s);
  line-height: 1.3;
}

.forum__latest-footer {
  width: 100%;
  margin-top: auto;
}

.forum__latest-timestamp {
  font-size: var(--font-size-xs);
  color: var(--color-text-lighter);
}

@media screen and (max-width: 480px) {
  .forum__latest-item {
    min-width: 256px;
  }
}
</style>
