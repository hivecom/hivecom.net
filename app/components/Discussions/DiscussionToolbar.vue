<script setup lang="ts">
import { Button, ButtonGroup, Flex, Tooltip } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

interface Props {
  viewMode: 'flat' | 'threaded'
  hasComments: boolean
  /** Whether the #center slot holds a pagination control (drives mobile wrap) */
  hasPagination?: boolean
  offtopicCount: number
  showOfftopic: boolean
  showThreadReplies: boolean
  showTimelineButton?: boolean
  /** Show the subscribe/unsubscribe bell button (comment model only) */
  showSubscribeButton?: boolean
  isSubscribed?: boolean
  subscriptionLoading?: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  'update:viewMode': [value: 'flat' | 'threaded']
  'update:showOfftopic': [value: boolean]
  'update:showThreadReplies': [value: boolean]
  'goToPinned': []
  'openTimeline': []
  'goToEnd': []
  'toggleSubscription': []
}>()

const isBelowSmall = useBreakpoint('<s')
</script>

<template>
  <Flex y-center x-between gap="xs" class="mb-m discussion-toolbar" :class="{ 'discussion-toolbar--paginated': hasPagination }">
    <Flex y-center gap="xs">
      <!-- View mode segmented control - hidden when there are no replies -->
      <ButtonGroup v-if="hasComments" size="s">
        <Tooltip :disabled="isBelowSmall">
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
        <Tooltip :disabled="isBelowSmall">
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

      <!-- Expand threads toggle - threaded view only -->
      <Tooltip v-if="hasComments && viewMode === 'threaded'" :disabled="isBelowSmall">
        <Button
          square
          size="s"
          :variant="showThreadReplies ? 'fill' : 'gray'"
          :outline="!showThreadReplies"
          @click="emit('update:showThreadReplies', !showThreadReplies)"
        >
          <Icon :size="18" :name="showThreadReplies ? 'ph:arrows-in-line-vertical' : 'ph:arrows-out-line-vertical'" />
        </Button>
        <template #tooltip>
          <p>{{ showThreadReplies ? 'Collapse reply threads' : 'Expand reply threads' }}</p>
        </template>
      </Tooltip>

      <!-- Off-topic toggle - only shown when relevant -->
      <Tooltip v-if="offtopicCount > 0" :disabled="isBelowSmall">
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

    <!-- Centered slot - the pagination control rides on this row (see Discussion.vue) -->
    <Flex x-center y-center class="discussion-toolbar__center">
      <slot name="center" />
    </Flex>

    <Flex gap="xs">
      <Tooltip v-if="showSubscribeButton" :disabled="isBelowSmall">
        <Button
          square
          size="s"
          variant="gray"
          :outline="!isSubscribed"
          :loading="subscriptionLoading"
          @click="emit('toggleSubscription')"
        >
          <Icon :size="16" :name="isSubscribed ? 'ph:bell-ringing' : 'ph:bell'" :class="{ 'text-color-accent': isSubscribed }" />
        </Button>
        <template #tooltip>
          <p>{{ isSubscribed ? 'Unsubscribe from replies' : 'Subscribe to replies' }}</p>
        </template>
      </Tooltip>

      <Flex v-if="showTimelineButton" gap="xs" class="discussion-toolbar__timeline-btn">
        <Tooltip :disabled="isBelowSmall">
          <Button square size="s" variant="gray" @click="emit('openTimeline')">
            <Icon :size="18" name="ph:clock" />
          </Button>
          <template #tooltip>
            <p>Jump to date</p>
          </template>
        </Tooltip>
        <Tooltip :disabled="isBelowSmall">
          <Button v-if="!isBelowSmall" size="s" variant="gray" @click="emit('goToEnd')">
            <template #end>
              <Icon :size="18" name="ph:arrow-down" />
            </template>
            <span>
              Latest
            </span>
          </Button>
          <Button v-else square size="s" variant="gray" @click="emit('goToEnd')">
            <Icon :size="18" name="ph:arrow-down" />
          </Button>
          <template #tooltip>
            <p>Go to last reply</p>
          </template>
        </Tooltip>
      </Flex>
    </Flex>
  </Flex>
</template>

<style scoped lang="scss">
// Grow to fill the row between the left controls and the right group so the
// pagination slot sits centered in the leftover space.
.discussion-toolbar__center {
  flex: 1;
}

// On mobile the timeline buttons join the row, so the pagination gets crowded.
// Drop it onto its own full-width line below the switcher/timeline controls.
// The container's gap supplies the spacing between the two lines. Only the
// paginated state wraps, so a single-page toolbar keeps its empty centre inline.
@media screen and (max-width: $breakpoint-m) {
  .discussion-toolbar--paginated {
    flex-wrap: wrap;

    .discussion-toolbar__center {
      order: 1;
      flex-basis: 100%;
    }
  }
}

.discussion-toolbar__timeline-btn {
  @media screen and (min-width: $breakpoint-m) {
    display: none !important;
  }
}
</style>
