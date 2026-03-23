<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Tooltip } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useTopicIcon } from '@/composables/useTopicIcon'
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
  update: [data: Tables<'discussion_topics'> | Tables<'discussions'>]
  remove: [id: string]
}>()

dayjs.extend(relativeTime)

const topicId = computed(() => data.id)
const { iconUrl } = useTopicIcon(topicId)
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
      <div
        class="forum__category-post--icon"
        :class="{
          'has-new': hasNew,
          'has-topic-icon': !!iconUrl,
        }"
      >
        <img
          v-if="iconUrl"
          :src="iconUrl"
          :alt="`${data.name} icon`"
          class="topic-icon__image"
        >
        <Icon name="ph:folder-open" :size="20" class="topic-icon__folder" />
      </div>
      <div class="forum__category-post--name">
        <strong>
          {{ data.name }}
          <Tooltip>
            <BadgeCircle v-if="data.is_locked">
              <Icon name="ph:lock" />
            </BadgeCircle>
            <template #tooltip>
              <p>Locked</p>
            </template>
          </Tooltip>

          <Tooltip>
            <BadgeCircle v-if="data.is_archived" variant="warning">
              <Icon name="ph:archive" class="text-color-yellow" />
            </BadgeCircle>
            <template #tooltip>
              <p>Archived</p>
            </template>
          </Tooltip>
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

      <ForumItemActions table="discussion_topics" :data @update="emit('update', $event)" @remove="emit('remove', $event)" />
    </NuxtLink>
  </li>
</template>

<style scoped lang="scss">
.forum__category-post--icon {
  position: relative;
  overflow: hidden;

  .iconify {
    color: var(--color-text);
  }

  // When the topic has a custom icon, layer the image behind the folder icon
  // and animate on hover
  &.has-topic-icon {
    .topic-icon__image {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: inherit;
      filter: grayscale(1);
      opacity: 0.25;
      transition:
        filter var(--transition-slow),
        opacity var(--transition-slow);
      z-index: 0;
    }

    .topic-icon__folder {
      position: relative;
      z-index: 1;
      transition: opacity var(--transition-slow);
    }
  }
}

.forum__category-post--item:hover .forum__category-post--icon.has-topic-icon {
  .topic-icon__image {
    filter: grayscale(0);
    opacity: 1;
  }

  .topic-icon__folder {
    opacity: 0;
  }
}
</style>
