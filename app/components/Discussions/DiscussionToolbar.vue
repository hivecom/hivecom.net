<script setup lang="ts">
import { Button, ButtonGroup, Flex, Tooltip } from '@dolanske/vui'

interface Props {
  viewMode: 'flat' | 'threaded'
  hasComments: boolean
  offtopicCount: number
  showOfftopic: boolean
  showTimelineButton?: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  'update:viewMode': [value: 'flat' | 'threaded']
  'update:showOfftopic': [value: boolean]
  'goToPinned': []
  'openTimeline': []
  'goToEnd': []
}>()
</script>

<template>
  <Flex y-center x-between gap="xs" class="mb-m">
    <Flex y-center gap="xs">
      <!-- View mode segmented control - hidden when there are no replies -->
      <ButtonGroup v-if="hasComments" size="s">
        <Tooltip>
          <Button
            square
            size="s"
            :outline="viewMode !== 'flat'"
            @click="emit('update:viewMode', 'flat')"
          >
            <Icon :size="18" name="ph:square-split-vertical" />
          </Button>
          <template #tooltip>
            <p>Flat view - all replies in chronological order</p>
          </template>
        </Tooltip>
        <Tooltip>
          <Button
            square
            size="s"
            :outline="viewMode !== 'threaded'"
            @click="emit('update:viewMode', 'threaded')"
          >
            <Icon :size="18" name="ph:arrows-split" />
          </Button>
          <template #tooltip>
            <p>Threaded view - replies nested under their parent</p>
          </template>
        </Tooltip>
      </ButtonGroup>

      <!-- Off-topic toggle - only shown when relevant -->
      <Tooltip v-if="offtopicCount > 0">
        <Button
          size="s"
          :variant="showOfftopic ? 'fill' : 'gray'"
          :outline="!showOfftopic"
          class="discussion__offtopic-switch"
          @click="emit('update:showOfftopic', !showOfftopic)"
        >
          <template #start>
            <Icon :size="18" :name="showOfftopic ? 'ph:chat-centered-text' : 'ph:chat-centered-slash'" />
          </template>
          Off topic ({{ offtopicCount }})
        </Button>
        <template #tooltip>
          <p>{{ showOfftopic ? 'Hide off-topic replies' : 'Show off-topic replies' }}</p>
        </template>
      </Tooltip>
    </Flex>

    <Flex v-if="showTimelineButton" gap="xs" class="discussion-toolbar__timeline-btn">
      <Tooltip>
        <Button square size="s" variant="gray" @click="emit('openTimeline')">
          <Icon :size="18" name="ph:clock" />
        </Button>
        <template #tooltip>
          <p>Jump to date</p>
        </template>
      </Tooltip>
      <Tooltip>
        <Button size="s" variant="gray" @click="emit('goToEnd')">
          <template #end>
            <Icon :size="18" name="ph:arrow-down" />
          </template>
          <span>
            Latest
          </span>
        </Button>
        <template #tooltip>
          <p>Go to last reply</p>
        </template>
      </Tooltip>
    </Flex>
  </Flex>
</template>

<style scoped lang="scss">
@use '@/assets/breakpoints.scss' as *;

.discussion-toolbar__timeline-btn {
  @media screen and (min-width: $breakpoint-m) {
    display: none !important;
  }
}
</style>
