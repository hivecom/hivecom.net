<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'
import constants from '~~/constants.json'
import { useBreakpoint } from '@/lib/mediaQuery'

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
  /**
   * Whether this UI is shown in the admin dashboard
   */
  isAdmin?: boolean
}

const props = withDefaults(defineProps<CalendarButtonsProps>(), {
  size: 'm',
  variant: 'gray',
  showLabels: false,
})

const isBelowMediumBreakpoint = useBreakpoint('<m')
const isBelowMedium = computed(() => isBelowMediumBreakpoint.value && !!props.isAdmin)
</script>

<template>
  <Flex gap="xs" :x-center="isBelowMedium" :expand="isBelowMedium">
    <!-- Google Calendar button -->
    <Button
      v-if="constants.EVENT_CALENDAR.GOOGLE"
      :expand="isBelowMedium"
      :variant="variant"
      :size="size"
      :href="constants.EVENT_CALENDAR.GOOGLE"
      target="_blank"
      :square="!showLabels && !isBelowMedium"
      rel="noreferrer"
      data-title-bottom="Add to your Google Calendar"
    >
      <template v-if="showLabels" #start>
        <Icon name="ph:calendar" />
      </template>
      <Icon v-if="!showLabels" name="ph:calendar" />
      <span v-if="showLabels" class="text-s">Subscribe</span>
    </Button>

    <!-- Export to ICAL button -->
    <Button
      v-if="constants.EVENT_CALENDAR.ICAL"
      :expand="isBelowMedium"
      :variant="variant"
      :size="size"
      :square="!showLabels && !isBelowMedium"
      :href="constants.EVENT_CALENDAR.ICAL"
      rel="noreferrer"
      data-title-bottom="Export ICAL"
    >
      <template v-if="showLabels" #start>
        <Icon name="ph:download" />
      </template>
      <Icon v-if="!showLabels" name="ph:download" />
      <span v-if="showLabels" class="text-s">Export</span>
    </Button>
  </Flex>
</template>
