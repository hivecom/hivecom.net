<script setup lang="ts">
import type { ChannelEntry } from '@/lib/chat/channelActivity'
import { Flex, Sheet } from '@dolanske/vui'
import { channelActivity, channelActivityTitle } from '@/lib/chat/channelActivity'

// Every channel the metrics snapshot knows about, opened from the four the
// chat card has room for. Ranking and the join flow stay in the card, since
// joining a channel is a thing that happens to your connection rather than to
// this list.
defineProps<{
  open: boolean
  channels: ChannelEntry[]
}>()

const emit = defineEmits<{ close: [], open: [entry: ChannelEntry] }>()
</script>

<template>
  <Sheet :open="open" :size="456" @close="emit('close')">
    <template #header>
      <h4>Channels</h4>
    </template>

    <Flex column gap="xs" class="pt-s">
      <button
        v-for="entry in channels"
        :key="entry.key"
        type="button"
        class="home-item inline home-channel-row"
        :title="channelActivityTitle(entry)"
        @click="emit('open', entry)"
      >
        <strong>{{ entry.name }}</strong>
        <span>{{ channelActivity(entry) }}</span>
      </button>

      <p v-if="!channels.length" class="text-s text-color-lighter">
        No channels reported.
      </p>
    </Flex>
  </Sheet>
</template>

<style scoped lang="scss">
// The rows are buttons, so the button chrome comes off and the row draws
// itself the way the card's tiles do.
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
