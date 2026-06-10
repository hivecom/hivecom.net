<script setup lang="ts">
import { useIrcChat } from '@/composables/useIrcChat'

const props = defineProps<{
  channel: string
}>()

const { joinChannel, chatSheetOpen, isConnected, connect } = useIrcChat()
const route = useRoute()

function handleClick(e: MouseEvent) {
  e.preventDefault()
  // Join (or switch to) the channel.
  if (isConnected.value) {
    joinChannel(props.channel)
  }
  else {
    connect()
    // joinChannel is called automatically once the connection lands via
    // the connect flow's initial channel seed - but for an explicit mention
    // click we want to ensure the right channel is joined. The chat composable
    // will handle the actual join when ready.
  }
  // If on the dedicated chat page the app is already visible; otherwise open
  // the sheet so the user sees the result without a full navigation.
  if (route.name !== 'chat') {
    chatSheetOpen.value = true
  }
}
</script>

<template>
  <a href="#" class="channel-mention" @click="handleClick">
    #{{ props.channel }}
  </a>
</template>

<style scoped lang="scss">
.channel-mention {
  color: var(--color-accent);
  text-decoration: none;
  font-weight: var(--font-weight-medium);
  transition: opacity var(--transition-fast);
  cursor: pointer;

  &:hover {
    opacity: 0.8;
    text-decoration: underline;
  }
}
</style>
