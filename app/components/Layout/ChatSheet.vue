<script setup lang="ts">
import { Button, Sheet, Tooltip } from '@dolanske/vui'
import ChatApp from '@/components/Chat/ChatApp.vue'
import ChatToolbar from '@/components/Chat/Toolbar.vue'
import { useIrcChat } from '@/composables/useIrcChat'

const props = defineProps<{
  // When true, render a plain (mobile) trigger instead of the tooltip button.
  mobile?: boolean
}>()

const open = ref(false)
const { isConnected } = useIrcChat()

const route = useRoute()
watch(() => route.fullPath, () => {
  open.value = false
})
</script>

<template>
  <div class="chat-sheet">
    <Tooltip v-if="!props.mobile">
      <Button
        square
        plain
        aria-label="Chat"
        class="vui-button-accent-weak vui-button-rounded"
        @click="open = true"
      >
        <Icon name="ph:chats" size="20" />
        <span v-if="isConnected" class="chat-sheet__badge" />
      </Button>
      <template #tooltip>
        <p>Chat</p>
      </template>
    </Tooltip>

    <Button
      v-else
      square
      plain
      aria-label="Chat"
      class="vui-button-accent-weak vui-button-rounded"
      @click="open = true"
    >
      <Icon name="ph:chats" size="20" />
      <span v-if="isConnected" class="chat-sheet__badge" />
    </Button>

    <Sheet
      :open="open"
      position="right"
      :size="520"
      :card="{ separators: true }"
      class="chat-sheet__panel"
      @close="open = false"
    >
      <template #header>
        <ChatToolbar expandable @collapse="open = false" />
      </template>

      <ChatApp compact />
    </Sheet>
  </div>
</template>

<style lang="scss" scoped>
.chat-sheet {
  position: relative;

  &__badge {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 10px;
    height: 10px;
    border-radius: var(--border-radius-pill);
    background-color: var(--color-text-green);
    border: 2px solid var(--color-bg);
    pointer-events: none;
  }
}
</style>

<style lang="scss">
// Sheet content is teleported, so this rule is intentionally global. It lets the
// chat panel fill the full height of the sheet body.
.chat-sheet__panel > .vui-card-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
</style>
