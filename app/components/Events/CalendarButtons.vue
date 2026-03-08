<script setup lang="ts">
import { Button, Flex, Tooltip } from '@dolanske/vui'
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
    <Tooltip v-if="constants.EVENT_CALENDAR.GOOGLE">
      <Button
        :expand="isBelowMedium"
        :variant="variant"
        :size="size"
        :href="constants.EVENT_CALENDAR.GOOGLE"
        target="_blank"
        :square="!showLabels && !isBelowMedium"
        rel="noreferrer"
      >
        <template v-if="showLabels" #start>
          <Icon name="ph:calendar" />
        </template>
        <Icon v-if="!showLabels" name="ph:calendar" />
        <span v-if="showLabels" class="text-s">Subscribe</span>
      </Button>
      <template #tooltip>
        <p>Add to your Google Calendar</p>
      </template>
    </Tooltip>

    <!-- Export to ICAL button -->
    <Tooltip v-if="constants.EVENT_CALENDAR.ICAL">
      <Button
        :expand="isBelowMedium"
        :variant="variant"
        :size="size"
        :square="!showLabels && !isBelowMedium"
        :href="constants.EVENT_CALENDAR.ICAL"
        rel="noreferrer"
      >
        <template v-if="showLabels" #start>
          <Icon name="ph:download" />
        </template>
        <Icon v-if="!showLabels" name="ph:download" />
        <span v-if="showLabels" class="text-s">Export</span>
      </Button>
      <template #tooltip>
        <p>Export ICAL</p>
      </template>
    </Tooltip>
  </Flex>
</template>
