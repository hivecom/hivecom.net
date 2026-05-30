<script setup lang="ts">
import ChatApp from '@/components/Chat/ChatApp.vue'
</script>

<template>
  <div class="chat-page container-l">
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
}
</style>
