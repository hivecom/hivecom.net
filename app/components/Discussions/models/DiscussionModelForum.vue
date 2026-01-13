<script setup lang="ts">
import type { Comment } from '../Discussion.vue'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import UserPreviewCard from '@/components/Shared/UserPreviewCard.vue'

interface Props {
  data: Comment
}

const {
  data,
} = defineProps<Props>()
</script>

<template>
  <div class="discussion-forum">
    <div class="discussion-forum__author">
      <UserPreviewCard :user-id="data.userId" :show-activity="false" />
    </div>
    <div class="discussion-forum__content">
      <MDRenderer :md="data.text" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.discussion-forum {
  display: grid;
  grid-template-columns: 292px 1fr;
  gap: 0;
  margin-bottom: var(--space-m);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);

  &__author {
    // display: flex;
    // flex-direction: column;
    // gap: var(--space-s);
    border-right: 1px solid var(--color-border);
  }

  &__content {
    padding: var(--space-m);
    background-color: var(--color-bg-medium);
    border-bottom-right-radius: var(--border-radius-m);
    border-top-right-radius: var(--border-radius-m);
  }

  &__badges {
    padding-left: 8px;
    height: 36px;
  }
}
</style>
