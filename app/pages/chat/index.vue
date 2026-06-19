<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

import ChatChannelBrowserModal from '@/components/Chat/ChannelBrowserModal.vue'
import ChatApp from '@/components/Chat/ChatApp.vue'
import ChatNavSheet from '@/components/Layout/ChatNavSheet.vue'
import { useIrcChat } from '@/composables/useIrcChat'
import { useBreakpoint } from '@/lib/mediaQuery'

const isMobile = useBreakpoint('<s')
const { setChatVisible, channelBrowserOpen, joinChannel, setActive, seedChannel, openPm, isConnected, connState, connect } = useIrcChat()

const route = useRoute()
const router = useRouter()

onMounted(() => setChatVisible(true))
onUnmounted(() => setChatVisible(false))

// Deep-link: ?channel=staff or ?channel=dev/frontend (e.g. from a push
// notification tap) joins and focuses the channel; ?dm=<nick> opens the DM with
// that sender. Both are held pending until the connection is up, since a cold
// open mounts this page before the socket connects - seeding the channel also
// makes the post-connect auto-join land here.
const pendingChannel = ref<string | null>(null)
const pendingDm = ref<string | null>(null)

function applyPending() {
  if (!isConnected.value)
    return
  if (pendingChannel.value) {
    joinChannel(pendingChannel.value)
    setActive(pendingChannel.value)
    pendingChannel.value = null
  }
  if (pendingDm.value) {
    openPm(pendingDm.value)
    pendingDm.value = null
  }
}

// Tapping a chat push notification deep-links here with `notify=1` (and usually
// a `channel=`). The user already opted in by enabling notifications, so bypass
// the connect dialog and connect straight away - this overrides the per-device
// "connect automatically" preference, which only governs ordinary visits.
function maybeConnectFromNotification(notifyParam: unknown) {
  if (notifyParam !== '1')
    return
  if (!isConnected.value && connState.value !== 'connecting')
    void connect()
}

function consumeQueryParams() {
  const channelParam = route.query.channel
  if (typeof channelParam === 'string' && channelParam) {
    const name = channelParam.startsWith('#') ? channelParam : `#${channelParam}`
    pendingChannel.value = name
    // Seed so a connect that fires after this still auto-joins the right channel.
    seedChannel(name)
  }

  const dmParam = route.query.dm
  if (typeof dmParam === 'string' && dmParam)
    pendingDm.value = dmParam

  maybeConnectFromNotification(route.query.notify)

  // Strip the consumed params so the URL stays clean and a refresh/back doesn't
  // re-trigger a connect; the pending target survives in component state.
  if (route.query.channel != null || route.query.dm != null || route.query.notify != null) {
    const { channel: _channel, dm: _dm, notify: _notify, ...rest } = route.query
    void router.replace({ query: rest })
  }

  applyPending()
}

// Initial page load with ?channel=/?dm=/?notify=, and any later in-app navigation.
onMounted(consumeQueryParams)
watch(() => [route.query.channel, route.query.dm, route.query.notify], consumeQueryParams)

// Apply once the connection comes up (cold open mounts before connect).
watch(isConnected, (connected) => {
  if (connected)
    applyPending()
})
</script>

<template>
  <div class="chat-page" :class="{ 'chat-page--mobile': isMobile }">
    <ChatApp />
    <!-- On desktop chat uses the bare layout, which has no global Navigation to
         host the channel browser, so render it here. On mobile the navbar's
         Navigation already provides it. -->
    <ChatChannelBrowserModal v-if="!isMobile" :open="channelBrowserOpen" @close="channelBrowserOpen = false" />
    <ChatNavSheet v-if="isMobile" no-trigger />
  </div>
</template>

<style lang="scss" scoped>
.chat-page {
  width: 100%;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  min-height: 0;

  // On mobile, use fixed positioning instead of dvh so that the browser's
  // address-bar show/hide animation never triggers a layout shift that makes
  // the fixed navigation fold or jump.
  &--mobile {
    position: fixed;
    top: var(--navbar-offset);
    bottom: 0;
    left: 0;
    right: 0;
    height: auto;
  }
}
</style>
