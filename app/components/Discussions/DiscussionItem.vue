<script setup lang="ts">
import type { Comment } from './Discussion.vue'
import DiscussionModelComment from './models/DiscussionModelComment.vue'
import DiscussionModelForum from './models/DiscussionModelForum.vue'

interface Props {
  data: Comment
  model?: 'comment' | 'forum'
}

const {
  data,
  model,
} = defineProps<Props>()
</script>

<template>
  <div :id="`comment-${data.id}`" class="discussion-comment-wrapper">
    <DiscussionModelComment v-if="model === 'comment'" :data />
    <DiscussionModelForum v-else :data />
  </div>
</template>

<style scoped lang="scss">
.discussion-comment-wrapper {
  display: block;
}
</style>
