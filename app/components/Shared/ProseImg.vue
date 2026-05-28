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
const hasError = ref(false)
const src = computed(() => (attrs.src as string | undefined) ?? null)

function preload(url: string) {
  visibleSrc.value = null
  hasError.value = false
  if (!import.meta.client)
    return
  // blob: URLs are session-scoped and always fail on reload - treat as missing immediately
  if (url.startsWith('blob:')) {
    hasError.value = true
    return
  }
  const img = new Image()
  img.onload = () => {
    visibleSrc.value = url
  }
  img.onerror = () => {
    hasError.value = true
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
    <div v-if="hasError" class="prose-img-missing">
      <span>Missing or deleted media</span>
    </div>
    <div v-else-if="!visibleSrc" class="prose-img-skeleton" />
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

.prose-img-missing {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: var(--border-radius-s);
  background-color: var(--color-bg-raised);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url('/landing/noise.gif');
    background-size: 120px;
    background-repeat: repeat;
    opacity: 0.05;
    border-radius: inherit;
  }

  span {
    font-size: var(--font-size-xs);
    color: var(--color-text);
    background: var(--color-bg-medium);
    padding: var(--space-xxs) var(--space-xs);
    border-radius: var(--border-radius-s);
  }
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
