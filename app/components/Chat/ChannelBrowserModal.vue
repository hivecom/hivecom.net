<script setup lang="ts">
import { Badge, Button, ButtonGroup, Flex, Input, Modal, Skeleton, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ChannelModeBadges from '@/components/Chat/ChannelModeBadges.vue'
import { useIrcChat } from '@/composables/useIrcChat'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const isMobile = useBreakpoint('<s')
const { buffers, channelList, channelListLoading, listChannels, joinChannel } = useIrcChat()

function channelModes(name: string): Set<string> | undefined {
  const lower = name.toLowerCase()
  return (
    buffers.value.find(b => b.name.toLowerCase() === lower)?.modes
    ?? channelList.value.find(e => e.name.toLowerCase() === lower)?.modes
  )
}

const search = ref('')

type SortBy = 'name' | 'users'
const sortBy = ref<SortBy>('name')
const sortAsc = ref(true)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = q
    ? channelList.value.filter(
        c => c.name.toLowerCase().includes(q) || c.topic.toLowerCase().includes(q),
      )
    : channelList.value
  return [...list].sort((a, b) => {
    const cmp = sortBy.value === 'name'
      ? a.name.localeCompare(b.name)
      : a.userCount - b.userCount
    return sortAsc.value ? cmp : -cmp
  })
})

// IRC channel names: no spaces, commas, or bell; starts with # (or we prefix it)
// eslint-disable-next-line no-control-regex
const IRC_CHANNEL_INVALID = /[\s,\x07]/

const resolvedChannelName = computed(() => {
  const v = search.value.trim()
  if (!v)
    return null
  const name = /^[#&+!]/.test(v) ? v : `#${v}`
  if (IRC_CHANNEL_INVALID.test(name))
    return null
  return name
})

const canConnect = computed(() => resolvedChannelName.value !== null)

function connectToInput() {
  if (!resolvedChannelName.value)
    return
  join(resolvedChannelName.value)
}

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
  <Modal :open="open" :size="isMobile ? 'screen' : 'm'" @close="emit('close')">
    <template #header>
      <Flex y-center x-between expand>
        <h4>Browse channels</h4>
        <Flex gap="xxs" y-center>
          <ButtonGroup>
            <Button :variant="sortBy === 'name' ? 'fill' : 'gray'" size="s" @click="sortBy = 'name'">
              Name
            </Button>
            <Button :variant="sortBy === 'users' ? 'fill' : 'gray'" size="s" @click="sortBy = 'users'">
              Users
            </Button>
          </ButtonGroup>
          <Button square plain size="s" :aria-label="sortAsc ? 'Sort descending' : 'Sort ascending'" @click="sortAsc = !sortAsc">
            <Icon :name="sortAsc ? 'ph:sort-ascending' : 'ph:sort-descending'" size="13" />
          </Button>
        </Flex>
      </Flex>
    </template>

    <Flex column gap="s" expand>
      <Flex y-center gap="xxs" expand>
        <Button square outline aria-label="Refresh channel list" :disabled="channelListLoading" @click="listChannels">
          <Icon name="ph:arrows-clockwise" size="16" />
        </Button>
        <Input v-model="search" expand placeholder="Search or enter a channel name..." @keydown.enter="canConnect && connectToInput()" />
        <Tooltip>
          <Button
            square
            aria-label="Connect to channel"
            :disabled="!canConnect"
            :class="canConnect ? 'vui-button-accent' : 'vui-button-accent-weak'"
            @click="connectToInput"
          >
            <Icon name="ph:arrow-right" size="16" />
          </Button>
          <template #tooltip>
            <p v-if="resolvedChannelName">
              Connect to {{ resolvedChannelName }}
            </p>
            <p v-else>
              Enter a valid channel name
            </p>
          </template>
        </Tooltip>
      </Flex>

      <div v-if="channelListLoading" class="chat-channel-browser__list">
        <div v-for="i in 5" :key="i" class="chat-channel-browser__skeleton-item">
          <Flex y-center gap="xs" expand>
            <Skeleton :width="14" :height="14" :radius="2" />
            <Flex expand x-between y-center>
              <Skeleton :height="13" width="40%" :radius="3" />
              <Skeleton :width="26" :height="18" :radius="10" />
            </Flex>
          </Flex>
          <Skeleton v-if="i % 2 !== 0" :height="11" width="60%" :radius="3" class="chat-channel-browser__skeleton-topic" />
        </div>
      </div>

      <Flex v-else-if="filtered.length === 0" expand x-center>
        <p class="chat-channel-browser__empty">
          No channels found.
        </p>
      </Flex>

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
            <Flex y-center gap="xxs" class="chat-channel-browser__name-wrap">
              <span class="chat-channel-browser__name">{{ entry.name.replace(/^#/, '') }}</span>
              <ChannelModeBadges :modes="channelModes(entry.name)" shortform />
            </Flex>
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
  &__skeleton-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-xxs);
    padding: var(--space-xs) var(--space-s);
  }

  &__skeleton-topic {
    margin-left: calc(14px + var(--space-xs));
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

  &__name-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--space-xxs);
  }

  &__name {
    font-size: var(--font-size-s);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
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
