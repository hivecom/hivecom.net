<script setup lang="ts">
import type { useDataLinkPreview } from '@/composables/useDataLinkPreview'
import { Flex } from '@dolanske/vui'
import MarkdownPreview from '@/components/Shared/MarkdownPreview.vue'

type ThreadData = NonNullable<ReturnType<typeof useDataLinkPreview>['data']['value']> & { type: 'forum-discussion' }

defineProps<{
  data: ThreadData
  mentionLookup?: Record<string, string>
}>()
</script>

<template>
  <NuxtLink
    class="link-embed link-embed--discussion"
    :href="data.href"
  >
    <Flex column gap="xs" class="link-embed__body link-embed__body--column">
      <Flex y-center gap="s" class="link-embed__header">
        <Icon name="ph:chats-circle" class="link-embed__icon" />
        <span class="link-embed__eyebrow">{{ data.commentId ? 'Forum reply' : 'Forum discussion' }}</span>
      </Flex>

      <span class="link-embed__title">{{ data.title }}</span>

      <!-- When linking to a specific reply, show the reply content instead -->
      <template v-if="data.commentId">
        <MarkdownPreview
          v-if="data.replyContent"
          :markdown="data.replyContent"
          :mention-lookup="mentionLookup ?? {}"
          class="link-embed__description link-embed__description--reply"
        />
        <span v-else class="link-embed__description link-embed__description--empty">
          Reply unavailable
        </span>
        <Flex y-center gap="s" class="link-embed__meta">
          <span v-if="data.replyAuthorUsername" class="link-embed__meta-item">
            by {{ data.replyAuthorUsername }}
          </span>
          <template v-if="data.replyAuthorUsername && data.authorUsername">
            <span class="link-embed__meta-sep">&middot;</span>
          </template>
          <span v-if="data.authorUsername" class="link-embed__meta-item link-embed__meta-item--muted">
            in thread by {{ data.authorUsername }}
          </span>
        </Flex>
      </template>

      <!-- Plain discussion link: show description and reply count -->
      <template v-else>
        <p v-if="data.description" class="link-embed__description">
          {{ data.description }}
        </p>
        <Flex y-center gap="s" class="link-embed__meta">
          <span v-if="data.authorUsername" class="link-embed__meta-item">
            by {{ data.authorUsername }}
          </span>
          <span class="link-embed__meta-sep">&middot;</span>
          <span class="link-embed__meta-item">
            {{ data.replyCount }} {{ data.replyCount === 1 ? 'reply' : 'replies' }}
          </span>
        </Flex>
      </template>
    </Flex>
  </NuxtLink>
</template>
