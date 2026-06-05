<script setup lang="ts">
import { Button, Flex, Modal } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import { useIrcChat } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'

const { activeBuffer, joinChannel, openPm } = useIrcChat()
const { resolved: resolvedNicks, resolve: resolveNick } = useIrcNickResolver()

watch(activeBuffer, (buf) => {
  if (buf?.kind === 'pm')
    resolveNick([buf.name.toLowerCase()])
}, { immediate: true })

const pmUserId = computed(() => {
  if (activeBuffer.value?.kind !== 'pm')
    return null
  return resolvedNicks.value.get(activeBuffer.value.name.toLowerCase())?.id ?? null
})

const infoOpen = ref(false)

const TOPIC_RE = /(https?:\/\/\S+|#[^\s,]+|@\S+)/g

interface TopicSegment { type: 'text' | 'link' | 'channel' | 'mention', value: string }

function topicSegments(topic: string): TopicSegment[] {
  const out: TopicSegment[] = []
  let last = 0
  for (const m of topic.matchAll(TOPIC_RE)) {
    const idx = m.index ?? 0
    if (idx > last)
      out.push({ type: 'text', value: topic.slice(last, idx) })
    const val = m[0]
    if (val.startsWith('#'))
      out.push({ type: 'channel', value: val })
    else if (val.startsWith('@'))
      out.push({ type: 'mention', value: val })
    else
      out.push({ type: 'link', value: val })
    last = idx + val.length
  }
  if (last < topic.length)
    out.push({ type: 'text', value: topic.slice(last) })
  return out
}
</script>

<template>
  <Flex v-if="activeBuffer" y-center gap="s" class="channel-header" expand>
    <!-- Channel -->
    <template v-if="activeBuffer.kind === 'channel'">
      <Flex x-between expand y-center>
        <Flex y-center>
          <span class="channel-header__name">{{ activeBuffer.name }}</span>
          <span v-if="activeBuffer.topic" class="channel-header__topic">
            <template v-for="(seg, i) in topicSegments(activeBuffer.topic)" :key="i">
              <a v-if="seg.type === 'link'" :href="seg.value" target="_blank" rel="noopener noreferrer" class="channel-header__link">{{ seg.value }}</a>
              <span v-else-if="seg.type === 'channel'" class="channel-header__channel-ref text-s" @click="joinChannel(seg.value)">{{ seg.value }}</span>
              <span v-else-if="seg.type === 'mention'" class="channel-header__mention text-s" @click="openPm(seg.value.slice(1))">{{ seg.value }}</span>
              <template v-else>{{ seg.value }}</template>
            </template>
          </span>
        </Flex>
        <Button :disabled="!activeBuffer.topic" square plain aria-label="Channel info" @click="infoOpen = true">
          <Icon name="ph:info" size="14" />
        </Button>
      </Flex>
    </template>

    <!-- PM -->
    <template v-else-if="activeBuffer.kind === 'pm'">
      <UserAvatar v-if="pmUserId" :user-id="pmUserId" size="s" show-online-indicator />
      <AvatarMedia v-else :size="28" :alt="activeBuffer.name">
        <template #default>
          {{ activeBuffer.name.charAt(0).toUpperCase() }}
        </template>
      </AvatarMedia>
      <span class="channel-header__name">{{ activeBuffer.name }}</span>
    </template>

    <!-- Server -->
    <template v-else>
      <Icon name="ph:hard-drives" size="14" class="text-color-lighter" />
      <span class="channel-header__name">Server</span>
    </template>
  </Flex>

  <Modal v-if="activeBuffer?.kind === 'channel'" :open="infoOpen" size="m" @close="infoOpen = false">
    <template #header>
      <h4>{{ activeBuffer.name }}</h4>
    </template>
    <p v-if="activeBuffer.topic" class="channel-header__modal-topic text-s">
      <template v-for="(seg, i) in topicSegments(activeBuffer.topic)" :key="i">
        <a v-if="seg.type === 'link'" :href="seg.value" target="_blank" rel="noopener noreferrer" class="channel-header__link">{{ seg.value }}</a>
        <span v-else-if="seg.type === 'channel'" class="channel-header__channel-ref text-s" @click="joinChannel(seg.value)">{{ seg.value }}</span>
        <span v-else-if="seg.type === 'mention'" class="channel-header__mention text-s" @click="openPm(seg.value.slice(1))">{{ seg.value }}</span>
        <template v-else>
          {{ seg.value }}
        </template>
      </template>
    </p>
    <p v-else class="text-color-lighter">
      No topic set.
    </p>
  </Modal>
</template>

<style lang="scss" scoped>
.channel-header {
  padding: 0 var(--space-m);
  border-bottom: 1px solid var(--color-border-lighter);
  min-width: 0;
  min-height: 42px;

  &__name {
    font-weight: 600;
    flex-shrink: 0;
    white-space: nowrap;
  }

  &__topic {
    width: 100%;
    font-size: var(--font-size-xs);
    color: var(--color-text-light);
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
    min-width: 0;
  }

  &__link {
    color: var(--color-accent);
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  }

  &__channel-ref,
  &__mention {
    color: var(--color-accent);
    cursor: pointer;
    &:hover {
      text-decoration: underline;
    }
  }

  &__modal-topic {
    line-height: 1.6;
    word-break: break-word;
  }
}
</style>
