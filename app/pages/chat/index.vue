<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import ChatApp from '@/components/Chat/ChatApp.vue'
import { useIrcChat } from '@/composables/useIrcChat'
import { useBreakpoint } from '@/lib/mediaQuery'

const isMobile = useBreakpoint('<s')
const { setChatVisible, joinChannel, setActive, seedChannel, isConnected, connState, connect } = useIrcChat()
const route = useRoute()
const router = useRouter()

onMounted(() => setChatVisible(true))
onUnmounted(() => setChatVisible(false))

// Deep-link: ?channel=staff or ?channel=dev/frontend (e.g. from a push
// notification tap) joins and focuses the channel. The channel is held pending
// until the connection is up, since a cold open mounts this page before the
// socket connects - seeding it also makes the post-connect auto-join land here.
const pendingChannel = ref<string | null>(null)

function applyPendingChannel() {
  const name = pendingChannel.value
  if (!name || !isConnected.value)
    return
  joinChannel(name)
  setActive(name)
  pendingChannel.value = null
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

  maybeConnectFromNotification(route.query.notify)

  // Strip the consumed params so the URL stays clean and a refresh/back doesn't
  // re-trigger a connect; the pending channel survives in component state.
  if (route.query.channel != null || route.query.notify != null) {
    const { channel: _channel, notify: _notify, ...rest } = route.query
    void router.replace({ query: rest })
  }

  applyPendingChannel()
}

// Initial page load with ?channel=/?notify=, and any later in-app navigation.
onMounted(consumeQueryParams)
watch(() => [route.query.channel, route.query.notify], consumeQueryParams)

// Apply once the connection comes up (cold open mounts before connect).
watch(isConnected, (connected) => {
  if (connected)
    applyPendingChannel()
})
</script>

<template>
  <div
    class="chat-page" :class="{ 'container-l': !isMobile,
                                'chat-page--mobile': isMobile }"
  >
    <ChatApp />
  </div>
</template>

<style lang="scss" scoped>
.chat-page {
  width: 100%;
  height: 100dvh;
  padding-top: calc(var(--navbar-offset) + var(--space-m));
  padding-bottom: var(--space-l);
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
    padding: 0;
  }
}
</style>
