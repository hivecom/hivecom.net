<script setup lang="ts">
// Custom MDC component for <img> tags in rendered markdown.
// Registered as the 'img' component in MarkdownRendererInner's mdcComponents map.
// Uses the same JS preload pattern as AvatarMedia: a hidden Image() preloads the
// src so the browser caches it fully before the visible <img> mounts, then
// <Transition> fades it in cleanly with no partial top-to-bottom paint.

import { computed, ref, watch } from 'vue'

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const visibleSrc = ref<string | null>(null)
const src = computed(() => (attrs.src as string | undefined) ?? null)

function preload(url: string) {
  visibleSrc.value = null
  if (!import.meta.client)
    return
  const img = new Image()
  img.onload = () => {
    visibleSrc.value = url
  }
  img.onerror = () => {
    visibleSrc.value = url
  }
  img.src = url
}

watch(src, (url) => {
  if (url)
    preload(url)
  else
    visibleSrc.value = null
}, { immediate: true })
</script>

<template>
  <Transition name="prose-img-fade" mode="out-in">
    <div v-if="!visibleSrc" class="prose-img-skeleton" />
    <img
      v-else
      v-bind="$attrs"
      :src="visibleSrc"
      loading="lazy"
      decoding="async"
    >
  </Transition>
</template>

<style scoped lang="scss">
.prose-img-skeleton {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: var(--border-radius-s);
  background-color: var(--color-bg-raised);
  display: block;
}

img {
  display: block;
}
</style>

<style lang="scss">
.prose-img-fade-enter-active,
.prose-img-fade-leave-active {
  transition: var(--transition-slow);
}

.prose-img-fade-enter-from,
.prose-img-fade-leave-to {
  opacity: 0;
}
</style>
