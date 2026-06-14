<script setup lang="ts">
import { Button, Flex, Modal } from '@dolanske/vui'
import { computed, watch } from 'vue'
import ChannelModeBadges from '@/components/Chat/ChannelModeBadges.vue'
import IrcWhoisCard from '@/components/Chat/IrcWhoisCard.vue'
import MarkdownRenderer from '@/components/Shared/MarkdownRenderer.vue'
import UserPreviewCard from '@/components/Shared/UserPreviewCard.vue'
import { SERVICE_NICKS, useIrcChat, whoisStore } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'

const props = defineProps<{
  open: boolean
  /** When provided, show info for this channel name instead of the active buffer. */
  channelName?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const { activeBuffer, buffers, joinChannel, openPm, myChannelRole, channelSettingsOpen, closeBuffer } = useIrcChat()

// When channelName is provided, resolve that buffer for the channel modal.
const displayChannelBuffer = computed(() => {
  if (props.channelName)
    return buffers.value.find(b => b.name === props.channelName) ?? null
  return activeBuffer.value?.kind === 'channel' ? activeBuffer.value : null
})
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
  const buf = displayChannelBuffer.value
  if (!buf)
    return false
  const r = myChannelRole(buf.name)
  return r !== null && OP_PREFIXES.has(r.symbol)
})

const hasInfo = computed(() => {
  const buf = displayChannelBuffer.value
  if (!buf)
    return false
  return !!(
    buf.topic
    || buf.metadata?.get('markdown')
    || buf.metadata?.get('homepage')
    || buf.metadata?.get('avatar')
  )
})

const pmWhois = computed(() => {
  if (activeBuffer.value?.kind !== 'pm')
    return null
  return whoisStore.value.get(activeBuffer.value.name.toLowerCase()) ?? null
})

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
  <!-- PM info modal -->
  <Modal v-if="activeBuffer?.kind === 'pm'" :open="open" size="s" @close="emit('close')">
    <template #header>
      <h4 style="margin:0">
        {{ activeBuffer.name }}
      </h4>
    </template>
    <Flex column :gap="0">
      <UserPreviewCard v-if="pmUserId" :user-id="pmUserId" class="chat-info-modal__pm-preview" />
      <IrcWhoisCard v-if="pmWhois" :whois="pmWhois" :standalone="!pmUserId" :irc-only="!pmUserId" :is-service="pmIsService" :is-bot="pmIsBot" />
    </Flex>
  </Modal>

  <!-- Channel info modal -->
  <Modal v-if="displayChannelBuffer" :open="open" size="m" :card="{ separators: true }" @close="emit('close')">
    <template #header>
      <Flex x-between y-center gap="s">
        <Flex>
          <img
            v-if="displayChannelBuffer.metadata?.get('avatar')"
            :src="displayChannelBuffer.metadata.get('avatar')"
            class="chat-info-modal__avatar"
            :alt="displayChannelBuffer.name"
          >
          <Flex column :gap="0">
            <Flex y-center gap="xs">
              <h4 style="margin:0">
                {{ displayChannelBuffer.metadata?.get('display-name') ?? displayChannelBuffer.name }}
              </h4>
              <ChannelModeBadges v-if="displayChannelBuffer.modes?.size" :modes="displayChannelBuffer.modes" />
            </Flex>
            <span v-if="displayChannelBuffer.metadata?.get('display-name')" class="text-xs text-color-lighter">{{ displayChannelBuffer.name }}</span>
          </Flex>
        </Flex>
        <template v-if="canEdit">
          <Button plain square @click="emit('close'); channelSettingsOpen = displayChannelBuffer!.name">
            <Icon name="ph:gear" size="14" />
          </Button>
        </template>
      </Flex>
    </template>

    <Flex column gap="m">
      <!-- Topic -->
      <Flex v-if="displayChannelBuffer.topic" column gap="xxs">
        <span class="chat-info-modal__section-label">Topic</span>
        <p class="chat-info-modal__topic text-s">
          <template v-for="(seg, i) in topicSegments(displayChannelBuffer.topic)" :key="i">
            <a v-if="seg.type === 'link'" :href="seg.value" target="_blank" rel="noopener noreferrer" class="chat-info-modal__link">{{ seg.value }}</a>
            <span v-else-if="seg.type === 'channel'" class="chat-info-modal__channel-ref text-s" @click="joinChannel(seg.value)">{{ seg.value }}</span>
            <span v-else-if="seg.type === 'mention'" class="chat-info-modal__mention text-s" @click="openPm(seg.value.slice(1))">{{ seg.value }}</span>
            <template v-else>
              {{ seg.value }}
            </template>
          </template>
        </p>
      </Flex>

      <!-- Homepage -->
      <Flex v-if="displayChannelBuffer.metadata?.get('homepage')" column gap="xxs">
        <span class="chat-info-modal__section-label">Homepage</span>
        <a
          :href="displayChannelBuffer.metadata.get('homepage')"
          target="_blank"
          rel="noopener noreferrer"
          class="chat-info-modal__link text-s"
        >{{ displayChannelBuffer.metadata.get('homepage') }}</a>
      </Flex>

      <!-- Markdown description -->
      <Flex v-if="displayChannelBuffer.metadata?.get('markdown')" column gap="xxs">
        <span class="chat-info-modal__section-label">About</span>
        <MarkdownRenderer :md="displayChannelBuffer.metadata.get('markdown')!" skeleton-height="60px" />
      </Flex>

      <p v-if="!hasInfo" class="text-color-lighter text-s" style="margin:0">
        No information available.
      </p>
    </Flex>

    <template #footer>
      <Flex x-between y-center class="chat-info-modal__footer">
        <Flex gap="m" class="chat-info-modal__footer-meta">
          <span v-if="displayChannelBuffer.founder" class="chat-info-modal__footer-item">
            <span class="chat-info-modal__footer-label">Founded by</span>
            {{ displayChannelBuffer.founder }}
          </span>
          <span v-if="displayChannelBuffer.createdAt" class="chat-info-modal__footer-item">
            <span class="chat-info-modal__footer-label">Created</span>
            {{ new Date(displayChannelBuffer.createdAt).toLocaleDateString(undefined, { year: 'numeric',
                                                                                        month: 'short',
                                                                                        day: 'numeric' }) }}
          </span>
        </Flex>
        <div class="chat-info-modal__leave-footer">
          <Button
            expand
            variant="danger"
            @click="closeBuffer(displayChannelBuffer!.name); emit('close')"
          >
            Leave Channel
          </Button>
        </div>
      </Flex>
    </template>
  </Modal>
</template>

<style lang="scss" scoped>
.chat-info-modal__footer {
  width: 100%;
}

.chat-info-modal__footer-meta {
  @media (max-width: $breakpoint-s) {
    display: none;
  }
}

.chat-info-modal__footer-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: var(--font-size-xs);
  color: var(--color-text);
}

.chat-info-modal__footer-label {
  font-size: var(--font-size-xxs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-lighter);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.chat-info-modal__leave-footer {
  display: none;

  @media (max-width: $breakpoint-s) {
    display: flex;
    width: 100%;
  }
}

.chat-info-modal {
  &__pm-preview {
    width: 100%;
    max-width: 100%;
    padding: 0;
  }

  &__avatar {
    width: 36px;
    height: 36px;
    border-radius: var(--border-radius-s);
    object-fit: cover;
    flex-shrink: 0;
  }

  &__section-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-lighter);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  &__topic {
    line-height: 1.6;
    word-break: break-word;
    margin: 0;
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
