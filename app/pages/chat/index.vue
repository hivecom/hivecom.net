<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import ChatApp from '@/components/Chat/ChatApp.vue'
import { useIrcChat } from '@/composables/useIrcChat'
import { useBreakpoint } from '@/lib/mediaQuery'

const isMobile = useBreakpoint('<s')
const { setChatVisible } = useIrcChat()
onMounted(() => setChatVisible(true))
onUnmounted(() => setChatVisible(false))
</script>

<template>
  <div
    class="chat-page" :class="{ 'container-l': !isMobile,
                                'chat-page--mobile': isMobile }"
  >
    <ChatApp />
  </div>
</template>

<style lang="scss" scoped>
.chat-page {
  width: 100%;
  height: 100dvh;
  padding-top: calc(var(--navbar-offset) + var(--space-m));
  padding-bottom: var(--space-l);
  display: flex;
  flex-direction: column;
  min-height: 0;

  &--mobile {
    padding-top: var(--navbar-offset);
    padding-bottom: 0;
  }
}
</style>
