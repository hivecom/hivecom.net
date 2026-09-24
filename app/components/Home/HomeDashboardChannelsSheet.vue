<script setup lang="ts">
import type { ChannelEntry } from '@/lib/chat/channelActivity'
import { Flex, Sheet } from '@dolanske/vui'
import { computed } from 'vue'
import { channelActivity, channelActivityTitle } from '@/lib/chat/channelActivity'

// Ranking and the join flow stay in the chat card, since joining happens to your
// connection rather than to this list
const props = defineProps<{
  open: boolean
  channels: ChannelEntry[]
}>()

const emit = defineEmits<{ close: [], open: [entry: ChannelEntry] }>()

const activeChannels = computed(() => props.channels.filter(entry => entry.here > 0 || entry.messages > 0))
</script>

<template>
  <Sheet :open="open" :size="456" @close="emit('close')">
    <template #header>
      <h4>Channels</h4>
    </template>

    <Flex column gap="xs" class="pt-s">
      <button
        v-for="entry in activeChannels"
        :key="entry.key"
        type="button"
        class="home-item inline home-channel-row"
        :title="channelActivityTitle(entry)"
        @click="emit('open', entry)"
      >
        <strong>{{ entry.name }}</strong>
        <span>{{ channelActivity(entry) }}</span>
      </button>

      <p v-if="!activeChannels.length" class="text-s text-color-lighter">
        No channel activity today.
      </p>
    </Flex>
  </Sheet>
</template>

<style scoped lang="scss">
// Strips the button chrome off the rows
.home-channel-row {
  font: inherit;
  color: inherit;
  text-align: left;
  align-items: center;
  cursor: pointer;

  span {
    white-space: nowrap;
    flex-shrink: 0;
  }
}
</style>
