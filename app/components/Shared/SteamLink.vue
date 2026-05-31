<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'

const props = defineProps<{
  steamId: number | null
  showIcon?: boolean
  hideId?: boolean
  small?: boolean
}>()

const { guardedOpen } = useExternalLinkGuard()

// Format the Steam store URL if a steam_id exists
const steamStoreUrl = computed(() => {
  if (!props.steamId)
    return null
  return `https://store.steampowered.com/app/${props.steamId}`
})

// Navigate to Steam store page
function navigateToSteam() {
  if (steamStoreUrl.value) {
    guardedOpen(steamStoreUrl.value)
  }
}
</script>

<template>
  <span v-if="!steamId">-</span>
  <Button
    v-else
    variant="link"
    :small="small"
    style="padding: 0; display: block;"
    @click.stop="navigateToSteam"
  >
    <!-- This is yucky conditional logic and it's weird to put the number in the icon/start but it works for the game sheet -->
    <template v-if="showIcon" #start>
      <Flex y-end gap="xs">
        <Icon name="ph:steam-logo" />
        <template v-if="!hideId">
          {{ steamId }}
        </template>
      </Flex>
    </template>
    <template v-if="!showIcon">
      {{ hideId ? 'View on Steam' : steamId }}
    </template>
  </Button>
</template>
