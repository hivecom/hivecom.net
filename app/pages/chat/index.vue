<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import ChatApp from '@/components/Chat/ChatApp.vue'
import { useIrcChat } from '@/composables/useIrcChat'
import { useBreakpoint } from '@/lib/mediaQuery'

const isMobile = useBreakpoint('<s')
const { setChatVisible, joinChannel, setActive, isConnected } = useIrcChat()
const route = useRoute()
const router = useRouter()

onMounted(() => setChatVisible(true))
onUnmounted(() => setChatVisible(false))

// Deep-link: ?channel=staff or ?channel=dev/frontend joins and focuses the channel,
// then strips the param so the URL stays clean.
function handleChannelParam(channelParam: unknown) {
  if (!channelParam || typeof channelParam !== 'string')
    return
  const name = channelParam.startsWith('#') ? channelParam : `#${channelParam}`
  joinChannel(name)
  setActive(name)
  const { channel: _channel, ...rest } = route.query
  void router.replace({ query: rest })
}

// Run once on mount (initial page load with ?channel=)
onMounted(() => handleChannelParam(route.query.channel))

// Also react if the connection comes up after the param was already read
watch(isConnected, (connected) => {
  if (connected)
    handleChannelParam(route.query.channel)
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
