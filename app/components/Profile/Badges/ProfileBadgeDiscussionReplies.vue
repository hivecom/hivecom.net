<script setup lang="ts">
import { computed } from 'vue'
import ProfileBadge from '@/components/Profile/Badges/ProfileBadge.vue'
import { DISCUSSION_REPLY_MIN_COUNT, getDiscussionReplyVariant } from '@/lib/discussionBadge'

const props = defineProps<{
  replies: number
  compact?: boolean
}>()

const replyCount = computed(() => Math.max(0, Math.floor(props.replies ?? 0)))
const variant = computed(() => getDiscussionReplyVariant(replyCount.value))
const description = computed(() => `Posted ${replyCount.value} discussion repl${replyCount.value === 1 ? 'y' : 'ies'}.`)
const shouldRender = computed(() => (variant.value !== undefined) && replyCount.value >= DISCUSSION_REPLY_MIN_COUNT)
</script>

<template>
  <ProfileBadge
    v-if="shouldRender && variant"
    label="Chatterbox"
    :description="description"
    icon="ph:chats-bold"
    :variant="variant"
    :compact="props.compact"
  />
</template>
