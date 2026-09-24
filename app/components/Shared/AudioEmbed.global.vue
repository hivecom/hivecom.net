<script setup lang="ts">
// MDC override for <audio> in rendered markdown (the :::audio directive). Swaps
// the bare native player for AudioPlayer.

import { computed, useAttrs } from 'vue'
import AudioPlayer from '@/components/Shared/AudioPlayer.vue'

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()

const src = computed(() => (attrs.src as string | undefined) ?? '')

// Track title is the file name pulled from the URL.
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
