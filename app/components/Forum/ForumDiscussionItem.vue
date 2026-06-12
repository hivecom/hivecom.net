<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Tooltip } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import CountDisplay from '@/components/Shared/CountDisplay.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'

import ForumItemActions from './ForumItemActions.vue'

interface Props {
  data: Tables<'discussions'>
  lastActivity?: string | null
  hasNew?: boolean
}

const {
  data,
  lastActivity,
  hasNew,
} = defineProps<Props>()

const emit = defineEmits<{
  click: []
  update: [data: Tables<'discussion_topics'> | Tables<'discussions'>]
  remove: [id: string]
}>()

dayjs.extend(relativeTime)
</script>

<template>
  <li class="forum__category-post" :class="{ pinned: data.is_sticky }">
    <NuxtLink :to="`/forum/${data.slug ?? data.id}`" class="forum__category-post--item" @click="emit('click')">
      <div class="forum__category-post--icon" :class="{ 'has-new': hasNew }">
        <Icon name="ph:scroll" :size="20" />
        <!-- <Icon :name="data.icon" :size="20" /> -->
      </div>
      <div class="forum__category-post--name">
        <strong>
          {{ data.title }}
          <Tooltip>
            <Badge v-if="data.is_sticky" variant="accent" circle>
              <Icon name="ph:push-pin" class="text-color-accent" />
            </Badge>
            <template #tooltip>
              <p>Pinned</p>
            </template>
          </Tooltip>

          <Tooltip>
            <Badge v-if="data.is_locked" circle>
              <Icon name="ph:lock" />
            </Badge>
            <template #tooltip>
              <p>Locked</p>
            </template>
          </Tooltip>

          <Tooltip>
            <Badge v-if="data.is_archived" variant="warning" circle>
              <Icon name="ph:archive" class="text-color-yellow" />
            </Badge>
            <template #tooltip>
              <p>Archived</p>
            </template>
          </Tooltip>

          <Tooltip>
            <Badge v-if="data.is_nsfw" variant="danger" circle>
              <Icon name="ph:warning" class="text-color-red" />
            </Badge>
            <template #tooltip>
              <p>Sensitive content</p>
            </template>
          </Tooltip>
        </strong>
        <p>{{ data.description }}</p>
      </div>

      <div class="forum__category-post--meta">
        <CountDisplay :value="data.reply_count ?? 0" />
      </div>
      <div class="forum__category-post--meta">
        <CountDisplay :value="data.view_count ?? 0" />
      </div>
      <div class="forum__category-post--meta">
        <Tooltip placement="top">
          <span>{{ dayjs(lastActivity ?? data.created_at).fromNow() }}</span>
          <template #tooltip>
            <TimestampDate :date="lastActivity ?? data.created_at" :tooltip="false" type="displayDateTime" size="xs" />
          </template>
        </Tooltip>
      </div>

      <ForumItemActions table="discussions" :data @update="emit('update', $event)" @remove="emit('remove', $event)" />
    </NuxtLink>
  </li>
</template>

<style scoped lang="scss">

</style>
