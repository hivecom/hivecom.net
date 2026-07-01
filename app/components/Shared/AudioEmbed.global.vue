<script setup lang="ts">
// Custom MDC component for <audio> tags in rendered markdown.
// Registered as the 'audio' component in MarkdownRendererInner's mdcComponents
// map. processAudioDirectives emits <audio src="..."> for the :::audio
// directive; this swaps the bare native player for our AudioPlayer UI.

import { computed, useAttrs } from 'vue'
import AudioPlayer from '@/components/Shared/AudioPlayer.vue'

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()

const src = computed(() => (attrs.src as string | undefined) ?? '')

// Track title is the file name pulled from the URL, mirroring how the chat
// audio embeds label themselves.
const title = computed(() => {
  if (!src.value)
    return undefined
  try {
    const path = new URL(src.value, 'https://example.invalid').pathname
    return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)) || undefined
  }
  catch {
    return undefined
  }
})
</script>

<template>
  <AudioPlayer v-if="src" :src="src" :title="title" compact />
</template>
