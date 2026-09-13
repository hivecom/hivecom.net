<script setup lang="ts">
import type { ChatMessage } from '@/composables/useIrcChat'
import { useIrcChat } from '@/composables/useIrcChat'

// Marker shown next to a message the server never confirmed, with the two ways
// out: put it back on the wire, or drop it. Nothing here happens on its own - a
// message that failed to send waits for the user to decide.
const props = defineProps<{ message: ChatMessage }>()

const { canResend, resendMessage, discardMessage } = useIrcChat()
</script>

<template>
  <span class="chat-undelivered" title="The server never confirmed this message, so it probably never made it out.">
    <Icon name="ph:warning-circle" :size="12" />
    not sent
    <template v-if="canResend(props.message)">
      <button class="chat-undelivered__action" @click.stop="resendMessage(props.message)">
        Resend
      </button>
      <button class="chat-undelivered__action" @click.stop="discardMessage(props.message)">
        Discard
      </button>
    </template>
  </span>
</template>

<style lang="scss" scoped>
.chat-undelivered {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: var(--space-xs);
  font-size: var(--font-size-xs);
  color: var(--color-text-red);
  vertical-align: baseline;
  cursor: help;

  &__action {
    padding: 0 2px;
    font-size: inherit;
    font-family: inherit;
    color: var(--color-text-lighter);
    text-decoration: underline;
    cursor: pointer;

    &:hover {
      color: var(--color-text);
    }
  }
}
</style>
