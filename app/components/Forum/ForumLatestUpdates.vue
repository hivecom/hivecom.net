<script setup lang="ts">
import type { ActivityItem } from '@/composables/useForumActivityFeed'
import { Badge, Flex, Skeleton } from '@dolanske/vui'
import MarkdownPreview from '@/components/Shared/MarkdownPreview.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import { processMentionsToText, stripMarkdown } from '@/lib/markdownProcessors'

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
    <Flex y-center x-start expand class="mb-s">
      <h5>
        Latest updates
      </h5>
      <Badge v-if="props.postSinceYesterday" variant="accent">
        {{ props.postSinceYesterday }} today
      </Badge>
    </Flex>

    <div class="forum__latest-list">
      <template v-if="props.loading">
        <div v-for="item in 4" :key="item" class="forum__latest-item">
          <Flex x-between y-center expand>
            <Flex :gap="4" y-center>
              <Skeleton width="96px" height="15px" />
              <Skeleton width="64px" height="15px" />
            </Flex>
            <Skeleton width="40px" height="15px" />
          </Flex>
          <Skeleton class="forum__latest-title" width="45%" height="20px" />
          <Skeleton v-if="item < 3" class="forum__latest-description" width="80%" height="15px" />
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
          <p v-if="post.description" class="forum__latest-description">
            {{ stripMarkdown(processMentionsToText(post.description, props.mentionLookup)) }}
          </p>
          <Flex y-center x-between expand class="forum__latest-footer">
            <UserDisplay
              :user-id="post.user"
              size="s"
              show-role
            />
          </Flex>
        </NuxtLink>
      </template>
    </div>
  </section>
</template>
