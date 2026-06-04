<script setup lang="ts">
import { Button, Sheet, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ChatApp from '@/components/Chat/ChatApp.vue'
import ChatToolbar from '@/components/Chat/Toolbar.vue'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { useIrcChat } from '@/composables/useIrcChat'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  // When true, render a plain (mobile) trigger instead of the tooltip button.
  mobile?: boolean
  // When true, the trigger button is disabled and the sheet cannot be opened.
  disabled?: boolean
}>()

const isMobile = useBreakpoint('<s')
const sheetSize = computed(() => isMobile.value ? '100%' : 640)

const open = ref(false)
const { isConnected, hasUnread, hasMention, setChatVisible } = useIrcChat()
const { settings } = useDataUserSettings()

watch(open, val => setChatVisible(val))

// Honor the "only notify on mentions" preference for the navbar dot. When the
// sheet is open the user is actively reading, so suppress the dot entirely.
const showBadge = computed(() => {
  if (open.value || !isConnected.value)
    return false
  return settings.value.chat_notify_only_mentions ? hasMention.value : hasUnread.value
})

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
        :disabled="props.disabled"
        @click="open = true"
      >
        <Icon name="ph:chats" size="20" />
        <span v-if="showBadge" class="chat-sheet__badge" :class="{ 'chat-sheet__badge--mention': hasMention }" />
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
      :disabled="props.disabled"
      @click="open = true"
    >
      <Icon name="ph:chats" size="20" />
      <span v-if="showBadge" class="chat-sheet__badge" :class="{ 'chat-sheet__badge--mention': hasMention }" />
    </Button>

    <Sheet
      :open="open"
      position="right"
      :size="sheetSize"
      :card="{ separators: true }"
      class="chat-sheet__panel"
      @close="open = false"
    >
      <template #header>
        <ChatToolbar expandable compact @collapse="open = false" />
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

    &--mention {
      background-color: var(--color-text-red);
    }
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
