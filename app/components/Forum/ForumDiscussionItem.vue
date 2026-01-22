<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import TinyBadge from '../Shared/TinyBadge.vue'

// TODO: display if discussion / topic is locked or private

const {
  data,
} = defineProps<Props>()

dayjs.extend(relativeTime)

interface Props {
  data: Tables<'discussions'>
}
</script>

<template>
  <li class="forum__category-post" :class="{ pinned: data.is_sticky }">
    <!-- TODO: the link should point correctly to the right page -->
    <NuxtLink :to="`/forum/${data.id}`" class="forum__category-post--link">
      <div class="forum__category-post--icon">
        <!-- TODO: dynamic icon -->
        <Icon name="ph:scroll" />
        <!-- <Icon :name="data.icon" :size="20" /> -->
      </div>
      <div class="forum__category-post--name">
        <strong>
          <TinyBadge v-if="data.is_sticky" variant="accent" class="tiny">Pinned</TinyBadge>
          {{ data.title }}</strong>
        <p>{{ data.description }}</p>
      </div>

      <div class="forum__category-post--meta">
        <span>{{ data.reply_count }}</span>
      </div>
      <div class="forum__category-post--meta">
        <span>{{ data.view_count }}</span>
      </div>
      <div class="forum__category-post--meta">
        <span>{{ dayjs(data.modified_at).fromNow() }}</span>
      </div>
    </NuxtLink>
  </li>
</template>

<style scoped lang="scss">
.forum__category-post {
  &--meta span {
    font-size: var(--font-size-m);
    color: var(--color-text-lighter);
  }
}
</style>
