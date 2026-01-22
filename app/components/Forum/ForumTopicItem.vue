<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import BadgeCircle from '../Shared/BadgeCircle.vue'

// TODO: display if discussion / topic is locked or private

const {
  data,
} = defineProps<Props>()

dayjs.extend(relativeTime)

interface Props {
  data: Tables<'discussion_topics'>
}
</script>

<template>
  <li class="forum__category-post">
    <a class="forum__category-post--item" href="#">
      <div class="forum__category-post--icon">
        <!-- TODO: dynamic icon or an image -->
        <Icon name="ph:folder-open" />
        <!-- <Icon :name="data.icon" :size="20" /> -->
      </div>
      <div class="forum__category-post--name">
        <strong>
          {{ data.name }}
          <BadgeCircle v-if="data.is_locked" variant="accent" data-title-top="Locked">
            <Icon name="ph:lock" class="text-color-accent" />
          </BadgeCircle>

          <BadgeCircle v-if="data.is_locked" data-title-top="Archived">
            <Icon name="ph:archive" />
          </BadgeCircle>

        </strong>
        <p>{{ data.description }}</p>
      </div>

      <div class="forum__category-post--meta">
        <!-- <span>{{ data.reply_count }}</span> -->
      </div>
      <div class="forum__category-post--meta">
        <!-- <span>{{ data.view_count }}</span> -->
      </div>
      <div class="forum__category-post--meta">
        <span>{{ dayjs(data.modified_at).fromNow() }}</span>
      </div>
    </a>
  </li>
</template>

<style lang="scss">
.forum__category-post {
  &--meta span {
    font-size: var(--font-size-m);
    color: var(--color-text-lighter);
  }

  &--name {
    strong {
      display: flex;
      gap: 4px;
      align-items: center;
    }
  }
}
</style>
