<script setup lang="ts">
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import TinyBadge from '../Shared/TinyBadge.vue'

// TODO: display if discussion / topic is locked or private

const {
  data,
  pinned = false,
} = defineProps<Props>()

dayjs.extend(relativeTime)

interface Props {
  pinned?: boolean
  // TODO: replace with correct type
  data: {
    icon: string
    title: string
    description?: string
    countPosts: number
    countReplies: number
    countUsers: number
    lastUpdate: string
  }
}
</script>

<template>
  <li class="forum__category-post" :class="{ pinned }">
    <!-- TODO: replace with nuxt link pointing at the post -->
    <a href="#">
      <div class="forum__category-post--icon">
        <Icon :name="data.icon" :size="20" />
      </div>
      <div class="forum__category-post--name">
        <strong>
          <TinyBadge v-if="pinned" variant="accent" class="tiny">Pinned</TinyBadge>
          {{ data.title }}</strong>
        <p>{{ data.description }}</p>
      </div>

      <div class="forum__category-post--meta">
        <span>{{ data.countPosts }}</span>
      </div>
      <div class="forum__category-post--meta">
        <span>{{ data.countReplies }}</span>
      </div>
      <div class="forum__category-post--meta">
        <span>{{ data.countUsers }}</span>
      </div>
      <div class="forum__category-post--meta">
        <span>{{ dayjs(data.lastUpdate).fromNow() }}</span>
      </div>
    </a>
  </li>
</template>
