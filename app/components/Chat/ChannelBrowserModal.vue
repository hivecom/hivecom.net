<script setup lang="ts">
import { Badge, Button, Flex, Input, Modal, Spinner } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import { useIrcChat } from '@/composables/useIrcChat'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { channelList, channelListLoading, listChannels, joinChannel } = useIrcChat()

const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q)
    return channelList.value
  return channelList.value.filter(
    c => c.name.toLowerCase().includes(q) || c.topic.toLowerCase().includes(q),
  )
})

watch(() => props.open, (val) => {
  if (val) {
    search.value = ''
    listChannels()
  }
})

function join(name: string) {
  joinChannel(name)
  emit('close')
}
</script>

<template>
  <Modal :open="open" size="m" @close="emit('close')">
    <template #header>
      <Flex y-center x-between expand>
        <h4>Browse channels</h4>
        <Button square plain size="s" aria-label="Refresh channel list" :disabled="channelListLoading" @click="listChannels">
          <Icon name="ph:arrows-clockwise" size="16" />
        </Button>
      </Flex>
    </template>

    <Flex column gap="s" expand>
      <Input v-model="search" expand placeholder="Search channels..." />

      <Flex v-if="channelListLoading" y-center x-center gap="s" class="chat-channel-browser__loading">
        <Spinner />
        <span>Loading channels...</span>
      </Flex>

      <p v-else-if="filtered.length === 0" class="chat-channel-browser__empty">
        No channels found.
      </p>

      <div v-else class="chat-channel-browser__list">
        <button
          v-for="entry in filtered"
          :key="entry.name"
          type="button"
          class="chat-channel-browser__item"
          @click="join(entry.name)"
        >
          <Flex y-center gap="xs">
            <Icon name="ph:hash" size="14" class="chat-channel-browser__icon" />
            <span class="chat-channel-browser__name">{{ entry.name.replace(/^#/, '') }}</span>
            <Badge variant="neutral" size="s" class="chat-channel-browser__count">
              {{ entry.userCount }}
            </Badge>
          </Flex>
          <p v-if="entry.topic" class="chat-channel-browser__topic">
            {{ entry.topic }}
          </p>
        </button>
      </div>
    </Flex>
  </Modal>
</template>

<style lang="scss" scoped>
.chat-channel-browser {
  &__loading {
    padding: var(--space-xl) 0;
    color: var(--color-text-lighter);
    font-size: var(--font-size-s);
  }

  &__empty {
    padding: var(--space-xl) 0;
    text-align: center;
    font-size: var(--font-size-s);
    color: var(--color-text-lighter);
    margin: 0;
  }

  &__list {
    width: 100%;
    overflow-x: hidden;
    overflow-y: auto;
    max-height: 360px;
    display: flex;
    flex-direction: column;
    gap: var(--space-xxs);
    min-width: 0;
  }

  &__item {
    display: flex;
    flex-direction: column;
    gap: var(--space-xxs);
    width: 100%;
    min-width: 0;
    overflow: hidden;
    padding: var(--space-xs) var(--space-s);
    border: none;
    background: transparent;
    border-radius: var(--border-radius-s);
    cursor: pointer;
    text-align: left;
    color: var(--color-text);
    transition: background-color var(--transition-fast);

    &:hover {
      background: var(--color-bg-medium);
    }
  }

  &__icon {
    flex-shrink: 0;
    color: var(--color-text-lighter);
  }

  &__name {
    flex: 1;
    font-size: var(--font-size-s);
    font-weight: 500;
  }

  &__count {
    flex-shrink: 0;
  }

  &__topic {
    margin: 0;
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-left: calc(14px + var(--space-xs));
  }
}
</style>
