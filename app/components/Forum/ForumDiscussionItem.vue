<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import BadgeCircle from '../Shared/BadgeCircle.vue'
import ForumItemActions from './ForumItemActions.vue'

interface Props {
  data: Tables<'discussions'>
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
  <li class="forum__category-post" :class="{ pinned: data.is_sticky }">
    <NuxtLink :to="`/forum/${data.id}`" class="forum__category-post--item">
      <div class="forum__category-post--icon">
        <Icon name="ph:scroll" :size="20" />
        <!-- <Icon :name="data.icon" :size="20" /> -->
      </div>
      <div class="forum__category-post--name">
        <strong>
          {{ data.title }}
          <BadgeCircle v-if="data.is_sticky" variant="accent" data-title-top="Pinned">
            <Icon name="ph:push-pin" class="text-color-accent" />
          </BadgeCircle>

          <BadgeCircle v-if="data.is_locked" data-title-top="Locked">
            <Icon name="ph:lock" />
          </BadgeCircle>
        </strong>
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

      <ForumItemActions table="discussions" :data @update="emit('update', $event as any)" />
    </NuxtLink>
  </li>
</template>
