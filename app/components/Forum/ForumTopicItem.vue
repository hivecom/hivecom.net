<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import BadgeCircle from '../Shared/BadgeCircle.vue'

const {
  data,
} = defineProps<Props>()

dayjs.extend(relativeTime)

interface Props {
  data: Tables<'discussion_topics'>
}
</script>

<template>
  <li class="forum__category-post" role="button">
    <div class="forum__category-post--item topic">
      <div class="forum__category-post--icon">
        <Icon name="ph:folder-open" :size="20" />
        <!-- <Icon :name="data.icon" :size="20" /> -->
      </div>
      <div class="forum__category-post--name">
        <strong>
          {{ data.name }}
          <BadgeCircle v-if="data.is_locked" variant="accent" data-title-top="Locked">
            <Icon name="ph:lock" class="text-color-accent" />
          </BadgeCircle>

          <BadgeCircle v-if="data.is_locked" variant="info" data-title-top="Archived">
            <Icon name="ph:archive" class="text-color-blue" />
          </BadgeCircle>
        </strong>
        <p>{{ data.description }}</p>
      </div>

      <div class="forum__category-post--meta" />
      <div class="forum__category-post--meta" />
      <div class="forum__category-post--meta">
        <span>{{ dayjs(data.modified_at).fromNow() }}</span>
      </div>
    </div>
  </li>
</template>
