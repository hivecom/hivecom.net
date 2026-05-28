<script setup lang="ts">
import { Avatar } from '@dolanske/vui'
import { computed, nextTick, ref, watch } from 'vue'

interface Props {
  url?: string | null
  size?: 's' | 'm' | 'l' | number
  alt?: string
}

const props = withDefaults(defineProps<Props>(), {
  url: null,
  size: 'm',
  alt: 'avatar',
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const isWebm = computed(() => {
  const url = props.url
  if (!url)
    return false
  return (url.split('?')[0] ?? '').endsWith('.webm')
})

function getSizePixels(size: 's' | 'm' | 'l' | number): string {
  if (typeof size === 'number')
    return `${size}px`
  switch (size) {
    case 's': return '28px'
    case 'm': return '40px'
    case 'l': return '48px'
  }
}

const sizePixels = computed(() => getSizePixels(props.size))

// Only set after preload completes - guarantees the Transition fades in a
// fully decoded image. Uses nextTick for cache hits so the transition still
// plays after the component mounts.
const visibleSrc = ref<string | null>(null)

function preload(url: string) {
  if (!import.meta.client) {
    visibleSrc.value = url
    return
  }
  const img = new Image()
  img.src = url
  if (img.complete) {
    // Defer so the Transition has a chance to mount before we flip the value.
    nextTick(() => {
      visibleSrc.value = url
    })
    return
  }
  visibleSrc.value = null
  img.onload = () => {
    visibleSrc.value = url
  }
  img.onerror = () => {
    visibleSrc.value = null
  }
}

watch(
  () => props.url,
  (url) => {
    if (url)
      preload(url)
    else
      visibleSrc.value = null
  },
  { immediate: true },
)

const showFallback = computed(() => !visibleSrc.value)
</script>

<template>
  <video
    v-if="isWebm"
    :key="url!"
    :src="url!"
    class="avatar-media__video"
    :style="{ width: sizePixels,
              height: sizePixels }"
    :aria-label="alt"
    autoplay
    loop
    muted
    playsinline
    @click="emit('click', $event)"
  />
  <div
    v-else
    class="avatar-media__wrapper"
    :style="{ width: sizePixels,
              height: sizePixels }"
    @click="emit('click', $event)"
  >
    <!-- Fallback: shown while url is absent or preloading -->
    <Transition name="avatar-fade">
      <Avatar
        v-if="showFallback"
        :size="typeof size === 'string' ? size : undefined"
        :style="typeof size === 'number' ? { '--vui-avatar-size': sizePixels } : undefined"
        :alt="alt"
        v-bind="$attrs"
        class="avatar-media__layer"
      >
        <template v-if="$slots.default" #default>
          <slot />
        </template>
        <template v-if="$slots.overlay" #overlay>
          <slot name="overlay" />
        </template>
      </Avatar>
    </Transition>

    <!-- Image: only mounts once preload confirms it's cached -->
    <Transition name="avatar-fade">
      <img
        v-if="visibleSrc"
        :src="visibleSrc"
        :alt="alt"
        class="avatar-media__layer avatar-media__image"
      >
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.avatar-media {
  &__video {
    border-radius: var(--border-radius-pill);
    object-fit: cover;
    display: block;
    flex-shrink: 0;
  }

  &__wrapper {
    border: none !important;
    position: relative;
    flex-shrink: 0;
  }

  &__layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;

    // VUI Avatar needs explicit size to fill the absolute layer
    &.vui-avatar,
    :deep(.vui-avatar) {
      width: 100%;
      height: 100%;
    }
  }

  &__image {
    border-radius: var(--border-radius-pill);
    object-fit: cover;
  }
}
</style>

<style lang="scss">
.avatar-fade-enter-active,
.avatar-fade-leave-active {
  transition: var(--transition-slow);
}

.avatar-fade-enter-from,
.avatar-fade-leave-to {
  opacity: 0;
}
</style>
