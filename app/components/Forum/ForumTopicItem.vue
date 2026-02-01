<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import BadgeCircle from '../Shared/BadgeCircle.vue'
import ForumItemActions from './ForumItemActions.vue'

interface Props {
  data: Tables<'discussion_topics'>
}

const {
  data,
} = defineProps<Props>()

const emit = defineEmits<{
  update: [data: Tables<'discussion_topics'>]
}>()

dayjs.extend(relativeTime)
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

          <BadgeCircle v-if="data.is_archived" variant="warning" data-title-top="Archived">
            <Icon name="ph:archive" class="text-color-yellow" />
          </BadgeCircle>
        </strong>
        <p>{{ data.description }}</p>
      </div>

      <div class="forum__category-post--meta" />
      <div class="forum__category-post--meta" />
      <div class="forum__category-post--meta">
        <span>{{ dayjs(data.modified_at).fromNow() }}</span>
      </div>

      <ForumItemActions table="discussion_topics" :data @update="emit('update', $event as any)" />
    </div>
  </li>
</template>
