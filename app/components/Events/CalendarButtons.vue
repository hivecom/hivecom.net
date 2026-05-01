<script setup lang="ts">
import { Button, Dropdown, DropdownItem, DropdownTitle, Flex } from '@dolanske/vui'
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

  /**
   * Whether the current user is authenticated. When false, buttons link directly
   * to the official calendar instead of showing a dropdown.
   */
  isAuthenticated?: boolean
}

const props = withDefaults(defineProps<CalendarButtonsProps>(), {
  size: 'm',
  variant: 'gray',
  showLabels: false,
  isAuthenticated: true,
})

const isBelowMediumBreakpoint = useBreakpoint('<m')
const isBelowMedium = computed(() => isBelowMediumBreakpoint.value && !!props.isAdmin)

function openLink(url: string) {
  window.open(url, '_blank', 'noreferrer')
}

function openOfficialSubscribe() {
  openLink(constants.EVENT_CALENDAR.OFFICIAL.GOOGLE)
}

function openOfficialExport() {
  openLink(constants.EVENT_CALENDAR.OFFICIAL.ICAL)
}
</script>

<template>
  <Flex gap="xs" :x-center="isBelowMedium" :expand="isBelowMedium">
    <!-- Google Calendar - dropdown for authenticated, direct link for guests -->
    <Dropdown v-if="isAuthenticated" placement="bottom-start">
      <template #trigger="{ toggle }">
        <Button
          :expand="isBelowMedium"
          :variant="variant"
          :size="size"
          :square="!showLabels && !isBelowMedium"
          @click="toggle"
        >
          <template v-if="showLabels" #start>
            <Icon name="ph:calendar" />
          </template>
          <Icon v-if="!showLabels" name="ph:calendar" />
          <span v-if="showLabels" class="text-s">Subscribe</span>
        </Button>
      </template>

      <DropdownItem
        icon="ph:star"
        @click="openLink(constants.EVENT_CALENDAR.OFFICIAL.GOOGLE)"
      >
        Official
      </DropdownItem>
      <DropdownItem
        icon="ph:users"
        @click="openLink(constants.EVENT_CALENDAR.COMMUNITY.GOOGLE)"
      >
        Community
      </DropdownItem>
    </Dropdown>
    <Button
      v-else
      :expand="isBelowMedium"
      :variant="variant"
      :size="size"
      :square="!showLabels && !isBelowMedium"
      @click="openOfficialSubscribe"
    >
      <template v-if="showLabels" #start>
        <Icon name="ph:calendar" />
      </template>
      <Icon v-if="!showLabels" name="ph:calendar" />
      <span v-if="showLabels" class="text-s">Subscribe</span>
    </Button>

    <!-- ICAL export - dropdown for authenticated, direct link for guests -->
    <Dropdown v-if="isAuthenticated" placement="bottom-start">
      <template #trigger="{ toggle }">
        <Button
          :expand="isBelowMedium"
          :variant="variant"
          :size="size"
          :square="!showLabels && !isBelowMedium"
          @click="toggle"
        >
          <template v-if="showLabels" #start>
            <Icon name="ph:download" />
          </template>
          <Icon v-if="!showLabels" name="ph:download" />
          <span v-if="showLabels" class="text-s">Export</span>
        </Button>
      </template>

      <DropdownTitle>ICAL</DropdownTitle>
      <DropdownItem
        icon="ph:star"
        @click="openLink(constants.EVENT_CALENDAR.OFFICIAL.ICAL)"
      >
        Official
      </DropdownItem>
      <DropdownItem
        icon="ph:users"
        @click="openLink(constants.EVENT_CALENDAR.COMMUNITY.ICAL)"
      >
        Community
      </DropdownItem>
    </Dropdown>
    <Button
      v-else
      :expand="isBelowMedium"
      :variant="variant"
      :size="size"
      :square="!showLabels && !isBelowMedium"
      @click="openOfficialExport"
    >
      <template v-if="showLabels" #start>
        <Icon name="ph:download" />
      </template>
      <Icon v-if="!showLabels" name="ph:download" />
      <span v-if="showLabels" class="text-s">Export</span>
    </Button>
  </Flex>
</template>
