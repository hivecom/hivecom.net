<script setup lang="ts">
// Custom MDC component for <img> tags in rendered markdown.
// Registered as the 'img' component in MarkdownRendererInner's mdcComponents map
// so every image coming out of MDCRenderer gets these attributes automatically:
//   loading="lazy"  - defers off-screen images until near the viewport
//   decoding="async" - avoids blocking the main thread during image decode
// A CSS opacity fade-in fires once the image is fully decoded and painted.
// The onMounted cache-check handles already-cached images where the load
// event fires synchronously before Vue attaches the listener.

defineOptions({ inheritAttrs: false })

const loaded = ref(false)
const imgRef = useTemplateRef<HTMLImageElement>('img')

function onLoad() {
  loaded.value = true
}

function onError() {
  // Show broken-image state rather than leaving the element invisible
  loaded.value = true
}

onMounted(() => {
  // If the browser already has this image cached, `complete` is true and the
  // load event never fires - resolve immediately so it isn't stuck at opacity 0.
  if (imgRef.value?.complete) {
    loaded.value = true
  }
})
</script>

<template>
  <img
    ref="img"
    v-bind="$attrs"
    loading="lazy"
    decoding="async"
    :class="{ 'prose-img--loaded': loaded }"
    @load="onLoad"
    @error="onError"
  >
</template>

<style scoped lang="scss">
img {
  opacity: 0;
  transition: opacity var(--transition);

  &.prose-img--loaded {
    opacity: 1;
  }
}
</style>
