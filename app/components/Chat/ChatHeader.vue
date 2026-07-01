<script setup lang="ts">
import { Badge, Button, Flex, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ChatInfoModal from '@/components/Chat/ChannelInfoModal.vue'
import ChannelModeBadges from '@/components/Chat/ChannelModeBadges.vue'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import { useChatNavSheet } from '@/composables/useChatNavSheet'
import { SELF_SPACE_LABEL, SERVICE_NICKS, useIrcChat } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'
import { useBreakpoint } from '@/lib/mediaQuery'

defineProps<{
  // Tighter padding/height for the mobile dedicated page.
  compact?: boolean
}>()

const { activeBuffer, buffers, joinChannel, openPm, requestWhois, isUnauthorizedSubchannel, myChannelRole, serverLogPinned, isSelfBuffer } = useIrcChat()

const hasChannels = computed(() => buffers.value.some(b => b.kind === 'channel'))
const showHeader = computed(() => hasChannels.value || serverLogPinned.value)
const { open: navSheetOpen } = useChatNavSheet()
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

const hasPmInfo = computed(() => activeBuffer.value?.kind === 'pm')

const channelNeedsRegistration = computed(() => {
  if (activeBuffer.value?.kind !== 'channel')
    return false
  if (activeBuffer.value.registered !== false)
    return false
  const role = myChannelRole(activeBuffer.value.name)
  return role !== null && ['~', '&', '@'].includes(role.symbol)
})

const isMobile = useBreakpoint('<s')
const infoOpen = ref(false)

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
  <Flex v-if="activeBuffer && showHeader" y-center gap="s" class="channel-header" :class="{ 'channel-header--compact': compact }" expand>
    <Button v-if="isMobile" square plain aria-label="Back" class="channel-header__back" @click="navSheetOpen = true">
      <Icon name="ph:arrow-left" size="16" />
    </Button>
    <!-- Channel -->
    <template v-if="activeBuffer.kind === 'channel'">
      <Flex x-between expand y-center>
        <Flex y-center gap="xs" class="channel-header__left" :class="{ 'channel-header__left--clickable': isMobile }" @click="isMobile && (infoOpen = true)">
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
          <Tooltip v-if="isUnauthorizedSubchannel(activeBuffer.name)" placement="bottom">
            <Badge variant="warning" size="s" outline>
              <Icon name="ph:warning" size="11" />
            </Badge>
            <template #tooltip>
              <p>Unverified subchannel - the parent channel has not authorized this. It may not be associated with it.</p>
            </template>
          </Tooltip>
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
        <div class="channel-header__info-wrap">
          <Tooltip v-if="channelNeedsRegistration" placement="bottom-end">
            <span class="channel-header__info-dot" />
            <template #tooltip>
              <p>Channel not registered - open info to register with ChanServ.</p>
            </template>
          </Tooltip>
          <Button square plain aria-label="Channel info" @click="infoOpen = true">
            <Icon name="ph:info" size="14" />
          </Button>
        </div>
      </Flex>
    </template>

    <!-- PM -->
    <template v-else-if="activeBuffer.kind === 'pm'">
      <Flex x-between expand y-center>
        <Flex y-center gap="xs" :class="{ 'channel-header__left--clickable': isMobile }" @click="isMobile && openPmInfo()">
          <UserAvatar v-if="pmUserId" :user-id="pmUserId" :size="isMobile ? 22 : 's' " show-online-indicator show-preview linked />
          <AvatarMedia v-else :size="28" :alt="activeBuffer.name">
            <template #default>
              {{ activeBuffer.name.charAt(0).toUpperCase() }}
            </template>
          </AvatarMedia>
          <span class="channel-header__name">{{ isSelfBuffer(activeBuffer.name) ? SELF_SPACE_LABEL : activeBuffer.name }}</span>
          <ChannelModeBadges v-if="!isSelfBuffer(activeBuffer.name)" :is-service="pmIsService" :is-bot="pmIsBot" />
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

  <ChatInfoModal :open="infoOpen" @close="infoOpen = false" />
</template>

<style lang="scss" scoped>
.channel-header {
  padding: 0 var(--space-m);
  border-bottom: 1px solid var(--color-border-lighter);
  min-width: 0;
  min-height: 42px;

  &--compact {
    padding: 0 var(--space-s);
    min-height: 34px;
  }

  &__left {
    min-width: 0;
    flex: 1;

    &--clickable {
      cursor: pointer;
    }
  }

  &__avatar {
    width: 20px;
    height: 20px;
    border-radius: var(--border-radius-xs);
    object-fit: cover;
    flex-shrink: 0;
  }

  &__back {
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

  &__info-wrap {
    position: relative;
  }

  &__info-dot {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-text-yellow);
    pointer-events: none;
    z-index: 1;
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
}
</style>
