<script setup lang="ts">
import type { UserActivityItem } from '@/composables/useForumUserActivity'
import { Card, Skeleton } from '@dolanske/vui'
import TinyBadge from '@/components/Shared/TinyBadge.vue'

const props = defineProps<{
  loading: boolean
  items: UserActivityItem[]
  topicLookup: Map<string, string>
}>()
</script>

<template>
  <section class="forum__continue">
    <h5 class="mb-s">
      Recently visited
    </h5>

    <Card>
      <ul v-if="props.loading" class="forum__continue-list">
        <li v-for="item in 6" :key="item">
          <Skeleton :height="40" width="100%" />
        </li>
      </ul>

      <ul v-else-if="props.items.length > 0" class="forum__continue-list">
        <li v-for="item in props.items" :key="item.id">
          <NuxtLink :to="item.discussionHref" class="forum__continue-item">
            <TinyBadge class="ws-nowrap text-color-light">
              <Icon :name="item.type === 'Reply' ? 'ph:chat-circle' : 'ph:scroll'" :size="16" />
              {{ item.discussionTopicId ? topicLookup.get(item.discussionTopicId) ?? item.type : item.type }}
            </TinyBadge>
            <span class="forum__continue-title">{{ item.discussionTitle }}</span>
            <span class="forum__continue-time">{{ item.timestamp }}</span>
          </NuxtLink>
        </li>
      </ul>
    </Card>
  </section>
</template>
