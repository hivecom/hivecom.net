<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'
import constants from '~~/constants.json'

interface CalendarButtonsProps {
  /**
   * Size of the buttons
   */
  size?: 's' | 'm' | 'l'

  /**
   * Variant of the buttons
   */
  variant?: 'gray' | 'accent' | 'danger' | 'success'

  /**
   * Show labels on buttons
   */
  showLabels?: boolean
}

withDefaults(defineProps<CalendarButtonsProps>(), {
  size: 'm',
  variant: 'gray',
  showLabels: false,
})
</script>

<template>
  <Flex gap="xs">
    <!-- Google Calendar button -->
    <NuxtLink
      v-if="constants.EVENT_CALENDAR.GOOGLE"
      :to="constants.EVENT_CALENDAR.GOOGLE"
      target="_blank"
      external
    >
      <Button
        :variant="variant"
        :size="size"
        :href="constants.EVENT_CALENDAR.GOOGLE"
        data-title-bottom="Add to your Google Calendar"
        :icon="showLabels ? undefined : 'ph:calendar'"
      >
        <template v-if="showLabels" #start>
          <Icon name="ph:calendar" />
        </template>
        <span v-if="showLabels" class="text-s">Subscribe</span>
      </Button>
    </NuxtLink>

    <!-- Export to ICAL button -->
    <NuxtLink
      v-if="constants.EVENT_CALENDAR.ICAL"
      :to="constants.EVENT_CALENDAR.ICAL"
      external
    >
      <Button
        :variant="variant"
        :size="size"
        :href="constants.EVENT_CALENDAR.ICAL"
        data-title-bottom="Export ICAL"
        :icon="showLabels ? undefined : 'ph:download'"
      >
        <template v-if="showLabels" #start>
          <Icon name="ph:download" />
        </template>
        <span v-if="showLabels" class="text-s">Export</span>
      </Button>
    </NuxtLink>
  </Flex>
</template>
