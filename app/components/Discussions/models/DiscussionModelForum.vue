<script setup lang="ts">
import type { Comment } from '../Discussion.vue'
import { Card } from '@dolanske/vui'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'

interface Props {
  data: Comment
}

const {
  data,
} = defineProps<Props>()
</script>

<template>
  <Card class="discussion-forum">
    <MDRenderer :md="data.text" />
    <template #footer>
      <UserDisplay :user-id="data.userId" />
    </template>
  </Card>
</template>

<style lang="scss" scoped>
.discussion-forum {
  margin-bottom: var(--space-m);
}
</style>
