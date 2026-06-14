<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import ChatChannelBrowserModal from '@/components/Chat/ChannelBrowserModal.vue'
import ChatApp from '@/components/Chat/ChatApp.vue'
import ChatNavSheet from '@/components/Layout/ChatNavSheet.vue'
import { useIrcChat } from '@/composables/useIrcChat'
import { useBreakpoint } from '@/lib/mediaQuery'

const isMobile = useBreakpoint('<s')

const { setChatVisible, channelBrowserOpen } = useIrcChat()

onMounted(() => setChatVisible(true))
onUnmounted(() => setChatVisible(false))
</script>

<template>
  <div class="chat-exclusive">
    <ChatApp />
    <ChatChannelBrowserModal :open="channelBrowserOpen" @close="channelBrowserOpen = false" />
    <ChatNavSheet v-if="isMobile" no-trigger />
  </div>
</template>

<style lang="scss" scoped>
.chat-exclusive {
  width: 100%;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
</style>
