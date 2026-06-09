<script setup lang="ts">
import { Button, Flex, Modal } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ChannelModeBadges from '@/components/Chat/ChannelModeBadges.vue'
import IrcWhoisCard from '@/components/Chat/IrcWhoisCard.vue'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import MarkdownRenderer from '@/components/Shared/MarkdownRenderer.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import UserPreviewCard from '@/components/Shared/UserPreviewCard.vue'
import { SERVICE_NICKS, useIrcChat, whoisStore } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'

const { activeBuffer, buffers, joinChannel, openPm, myChannelRole, channelSettingsOpen, requestWhois } = useIrcChat()
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

const pmIsBot = computed(() => {
  if (activeBuffer.value?.kind !== 'pm')
    return false
  const name = activeBuffer.value.name.toLowerCase()
  return buffers.value.some(b => b.users?.some(u => u.name.toLowerCase() === name && u.bot))
})

const pmIsService = computed(() => {
  if (activeBuffer.value?.kind !== 'pm')
    return false
  return SERVICE_NICKS.has(activeBuffer.value.name.toLowerCase())
})

const OP_PREFIXES = new Set(['~', '&', '@'])
const canEdit = computed(() => {
  if (activeBuffer.value?.kind !== 'channel')
    return false
  const r = myChannelRole(activeBuffer.value.name)
  return r !== null && OP_PREFIXES.has(r.symbol)
})

const hasPmInfo = computed(() => activeBuffer.value?.kind === 'pm')

// Info button is enabled when there's anything worth showing.
const hasInfo = computed(() => {
  const buf = activeBuffer.value
  if (!buf || buf.kind !== 'channel')
    return false
  return !!(
    buf.topic
    || buf.metadata?.get('hivecom.net/markdown')
    || buf.metadata?.get('homepage')
    || buf.metadata?.get('avatar')
    || (buf.modes && buf.modes.size > 0)
  )
})

const infoOpen = ref(false)

const pmWhois = computed(() => {
  if (activeBuffer.value?.kind !== 'pm')
    return null
  return whoisStore.value.get(activeBuffer.value.name.toLowerCase()) ?? null
})

function openPmInfo() {
  if (activeBuffer.value?.kind === 'pm')
    requestWhois(activeBuffer.value.name)
  infoOpen.value = true
}

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
        <Flex y-center gap="xs" class="channel-header__left">
          <img
            v-if="activeBuffer.metadata?.get('avatar')"
            :src="activeBuffer.metadata.get('avatar')"
            class="channel-header__avatar"
            :alt="activeBuffer.name"
          >
          <span
            class="channel-header__name"
            :style="activeBuffer.metadata?.get('color') ? { color: activeBuffer.metadata.get('color') } : undefined"
          >{{ activeBuffer.metadata?.get('display-name') ?? activeBuffer.name }}</span>
          <span v-if="activeBuffer.topic" class="channel-header__topic">
            <template v-for="(seg, i) in topicSegments(activeBuffer.topic)" :key="i">
              <a v-if="seg.type === 'link'" :href="seg.value" target="_blank" rel="noopener noreferrer" class="channel-header__link">{{ seg.value }}</a>
              <span v-else-if="seg.type === 'channel'" class="channel-header__channel-ref text-s" @click="joinChannel(seg.value)">{{ seg.value }}</span>
              <span v-else-if="seg.type === 'mention'" class="channel-header__mention text-s" @click="openPm(seg.value.slice(1))">{{ seg.value }}</span>
              <template v-else>
                {{ seg.value }}
              </template>
            </template>
          </span>
        </Flex>
        <Button :disabled="!hasInfo" square plain aria-label="Channel info" @click="infoOpen = true">
          <Icon name="ph:info" size="14" />
        </Button>
      </Flex>
    </template>

    <!-- PM -->
    <template v-else-if="activeBuffer.kind === 'pm'">
      <Flex x-between expand y-center>
        <Flex y-center gap="xs">
          <UserAvatar v-if="pmUserId" :user-id="pmUserId" size="s" show-online-indicator show-preview linked />
          <AvatarMedia v-else :size="28" :alt="activeBuffer.name">
            <template #default>
              {{ activeBuffer.name.charAt(0).toUpperCase() }}
            </template>
          </AvatarMedia>
          <span class="channel-header__name">{{ activeBuffer.name }}</span>
          <ChannelModeBadges :is-service="pmIsService" :is-bot="pmIsBot" />
        </Flex>
        <Button :disabled="!hasPmInfo" square plain aria-label="User info" @click="openPmInfo">
          <Icon name="ph:info" size="14" />
        </Button>
      </Flex>
    </template>

    <!-- Server -->
    <template v-else>
      <Icon name="ph:hard-drives" size="14" class="text-color-lighter" />
      <span class="channel-header__name">Server</span>
    </template>
  </Flex>

  <Modal v-if="activeBuffer?.kind === 'pm'" :open="infoOpen" size="s" @close="infoOpen = false">
    <template #header>
      <h4 style="margin:0">
        {{ activeBuffer.name }}
      </h4>
    </template>
    <Flex column :gap="0">
      <UserPreviewCard v-if="pmUserId" :user-id="pmUserId" class="channel-header__pm-preview" />
      <IrcWhoisCard v-if="pmWhois" :whois="pmWhois" :standalone="!pmUserId" :irc-only="!pmUserId" :is-service="pmIsService" :is-bot="pmIsBot" />
    </Flex>
  </Modal>

  <Modal v-if="activeBuffer?.kind === 'channel'" :open="infoOpen" size="m" @close="infoOpen = false">
    <template #header>
      <Flex x-between y-center gap="s">
        <img
          v-if="activeBuffer.metadata?.get('avatar')"
          :src="activeBuffer.metadata.get('avatar')"
          class="channel-header__modal-avatar"
          :alt="activeBuffer.name"
        >
        <Flex column :gap="0">
          <Flex y-center gap="xs">
            <h4 style="margin:0">
              {{ activeBuffer.metadata?.get('display-name') ?? activeBuffer.name }}
            </h4>
            <ChannelModeBadges v-if="activeBuffer.modes?.size" :modes="activeBuffer.modes" />
          </Flex>
          <span v-if="activeBuffer.metadata?.get('display-name')" class="text-xs text-color-lighter">{{ activeBuffer.name }}</span>
        </Flex>
        <template v-if="canEdit">
          <Button plain square @click="infoOpen = false; channelSettingsOpen = activeBuffer!.name">
            <Icon name="ph:gear" size="14" />
          </Button>
        </template>
      </Flex>
    </template>

    <Flex column gap="m">
      <!-- Topic -->
      <Flex v-if="activeBuffer.topic" column gap="xxs">
        <span class="channel-header__modal-section-label">Topic</span>
        <p class="channel-header__modal-topic text-s">
          <template v-for="(seg, i) in topicSegments(activeBuffer.topic)" :key="i">
            <a v-if="seg.type === 'link'" :href="seg.value" target="_blank" rel="noopener noreferrer" class="channel-header__link">{{ seg.value }}</a>
            <span v-else-if="seg.type === 'channel'" class="channel-header__channel-ref text-s" @click="joinChannel(seg.value)">{{ seg.value }}</span>
            <span v-else-if="seg.type === 'mention'" class="channel-header__mention text-s" @click="openPm(seg.value.slice(1))">{{ seg.value }}</span>
            <template v-else>
              {{ seg.value }}
            </template>
          </template>
        </p>
      </Flex>

      <!-- Homepage -->
      <Flex v-if="activeBuffer.metadata?.get('homepage')" column gap="xxs">
        <span class="channel-header__modal-section-label">Homepage</span>
        <a
          :href="activeBuffer.metadata.get('homepage')"
          target="_blank"
          rel="noopener noreferrer"
          class="channel-header__link text-s"
        >{{ activeBuffer.metadata.get('homepage') }}</a>
      </Flex>

      <!-- Markdown description -->
      <Flex v-if="activeBuffer.metadata?.get('hivecom.net/markdown')" column gap="xxs">
        <span class="channel-header__modal-section-label">About</span>
        <MarkdownRenderer :md="activeBuffer.metadata.get('hivecom.net/markdown')!" skeleton-height="60px" />
      </Flex>

      <p v-if="!hasInfo" class="text-color-lighter text-s" style="margin:0">
        No information available.
      </p>
    </Flex>
  </Modal>
</template>

<style lang="scss" scoped>
.channel-header {
  padding: 0 var(--space-m);
  border-bottom: 1px solid var(--color-border-lighter);
  min-width: 0;
  min-height: 42px;

  &__left {
    min-width: 0;
    flex: 1;
  }

  &__avatar {
    width: 20px;
    height: 20px;
    border-radius: var(--border-radius-xs);
    object-fit: cover;
    flex-shrink: 0;
  }

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

  &__modal-avatar {
    width: 36px;
    height: 36px;
    border-radius: var(--border-radius-s);
    object-fit: cover;
    flex-shrink: 0;
  }

  &__modal-section-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-lighter);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  &__pm-preview {
    width: 100%;
    max-width: 100%;
    padding: 0;
  }

  &__modal-topic {
    line-height: 1.6;
    word-break: break-word;
    margin: 0;
  }
}
</style>
