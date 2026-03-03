<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import BadgeCircle from '../Shared/BadgeCircle.vue'
import ForumItemActions from './ForumItemActions.vue'

interface Props {
  data: Tables<'discussion_topics'>
  discussionCount?: number
  replyCount?: number
  viewCount?: number
  lastActivity?: string | null
  href?: string
  hasNew?: boolean
}

const {
  data,
  discussionCount,
  replyCount,
  viewCount,
  lastActivity,
  href,
  hasNew,
} = defineProps<Props>()

const emit = defineEmits<{
  click: []
  update: [data: Tables<'discussion_topics'>]
  remove: [id: string]
}>()

dayjs.extend(relativeTime)
</script>

<template>
  <li class="forum__category-post">
    <!--
      NuxtLink gives us a real <a> so middle-click / ctrl-click opens a new tab.
      Left-clicks are intercepted via @click.prevent so the parent's @click
      handler (which calls setActiveTopicFromTopic) drives navigation instead,
      allowing us to push a proper history entry.
    -->
    <NuxtLink
      class="forum__category-post--item topic"
      :to="href ?? '#'"
      @click.exact.prevent="emit('click')"
    >
      <div class="forum__category-post--icon" :class="{ 'has-new': hasNew }">
        <Icon name="ph:folder-open" :size="20" />
      </div>
      <div class="forum__category-post--name">
        <strong>
          {{ data.name }}
          <BadgeCircle v-if="data.is_locked" data-title-top="Locked">
            <Icon name="ph:lock" />
          </BadgeCircle>

          <BadgeCircle v-if="data.is_archived" variant="warning" data-title-top="Archived">
            <Icon name="ph:archive" class="text-color-yellow" />
          </BadgeCircle>
        </strong>
        <p>{{ data.description }}</p>
      </div>

      <div class="forum__category-post--meta">
        <span>{{ discussionCount || 0 }} / {{ replyCount ?? 0 }}</span>
      </div>
      <div class="forum__category-post--meta">
        <span>{{ viewCount ?? 0 }}</span>
      </div>
      <div class="forum__category-post--meta">
        <span>{{ dayjs(lastActivity ?? data.modified_at).fromNow() }}</span>
      </div>

      <ForumItemActions table="discussion_topics" :data @update="emit('update', $event as any)" @remove="emit('remove', $event)" />
    </NuxtLink>
  </li>
</template>

<style scoped lang="scss">
.forum__category-post--icon {
  position: relative;

  &.has-new::after {
    content: '';
    position: absolute;
    bottom: -3px;
    right: -3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-accent);
    border: 2px solid var(--color-bg);
  }
}
</style>
