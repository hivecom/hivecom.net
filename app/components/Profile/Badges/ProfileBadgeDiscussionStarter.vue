<script setup lang="ts">
import { computed } from 'vue'
import ProfileBadge from '@/components/Profile/Badges/ProfileBadge.vue'
import { DISCUSSION_STARTER_MIN_COUNT, getDiscussionStarterVariant } from '@/lib/discussionBadge'

const props = defineProps<{
  discussions: number
  compact?: boolean
}>()

const discussionCount = computed(() => Math.max(0, Math.floor(props.discussions ?? 0)))
const variant = computed(() => getDiscussionStarterVariant(discussionCount.value))
const description = computed(() => `Started ${discussionCount.value} forum discussion${discussionCount.value === 1 ? '' : 's'}.`)
const shouldRender = computed(() => (variant.value !== undefined) && discussionCount.value >= DISCUSSION_STARTER_MIN_COUNT)
</script>

<template>
  <ProfileBadge
    v-if="shouldRender && variant"
    label="Forum Regular"
    :description="description"
    icon="ph:note-pencil-bold"
    :variant="variant"
    :compact="props.compact"
  />
</template>
