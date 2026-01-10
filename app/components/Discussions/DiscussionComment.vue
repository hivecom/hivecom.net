<script setup lang="ts">
import type { Comment } from './Discussion.vue'
import DiscussionModelDefault from './models/DiscussionModelDefault.vue'
import DiscussionModelForum from './models/DiscussionModelForum.vue'

interface Props {
  data: Comment
  model?: 'default' | 'forum'
}

// TODO
// 1. Show if user is replying to somebode
// 2. Show when someone is replying to YOU

const {
  data,
  model,
} = defineProps<Props>()
</script>

<template>
  <DiscussionModelDefault v-if="model === 'default'" :data />
  <DiscussionModelForum v-else :data />
</template>
