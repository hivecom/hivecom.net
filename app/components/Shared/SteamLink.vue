<script setup lang="ts">
import { Button } from '@dolanske/vui'

const props = defineProps<{
  steamId: number | null
  showIcon?: boolean
  hideId?: boolean
  small?: boolean
}>()

// Format the Steam store URL if a steam_id exists
const steamStoreUrl = computed(() => {
  if (!props.steamId)
    return null
  return `https://store.steampowered.com/app/${props.steamId}`
})

// Navigate to Steam store page
function navigateToSteam() {
  if (steamStoreUrl.value) {
    window.open(steamStoreUrl.value, '_blank', 'noopener,noreferrer')
  }
}
</script>

<template>
  <span v-if="!steamId">-</span>
  <Button
    v-else
    :expand="false"
    variant="link"
    :small="small"
    style="padding: 0; display: block;"
    @click.stop="navigateToSteam"
  >
    <template v-if="showIcon" #start>
      <Icon name="ph:steam-logo" />
    </template>
    <template v-if="!hideId">
      {{ steamId }}
    </template>
  </Button>
</template>
