<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import ChatApp from '@/components/Chat/ChatApp.vue'
import { useIrcChat } from '@/composables/useIrcChat'
import { useBreakpoint } from '@/lib/mediaQuery'

const isMobile = useBreakpoint('<s')
const { setChatVisible, joinChannel, setActive, seedChannel, isConnected } = useIrcChat()
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

function consumeChannelParam(channelParam: unknown) {
  if (!channelParam || typeof channelParam !== 'string')
    return
  const name = channelParam.startsWith('#') ? channelParam : `#${channelParam}`
  pendingChannel.value = name
  // Seed so a connect that fires after this still auto-joins the right channel.
  seedChannel(name)
  // Strip the param so the URL stays clean; the pending channel survives it.
  const { channel: _channel, ...rest } = route.query
  void router.replace({ query: rest })
  applyPendingChannel()
}

// Initial page load with ?channel=, and any later in-app navigation to it.
onMounted(() => consumeChannelParam(route.query.channel))
watch(() => route.query.channel, channelParam => consumeChannelParam(channelParam))

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

  &--mobile {
    padding-top: var(--navbar-offset);
    padding-bottom: 0;
  }
}
</style>
