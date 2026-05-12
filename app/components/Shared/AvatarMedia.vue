<script setup lang="ts">
import { Avatar } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'

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

const imageLoaded = ref(false)

watch(() => props.url, () => {
  imageLoaded.value = false
})

function onLoad() {
  imageLoaded.value = true
}

const showFallback = computed(() => !props.url || !imageLoaded.value)
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
    <!-- Fallback: VUI Avatar with slot content (initials/spinner), shown until image loads -->
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

    <!-- Image layer: we own the <img> so we control exactly when it appears -->
    <Transition name="avatar-fade">
      <img
        v-if="url && imageLoaded"
        :src="url"
        :alt="alt"
        class="avatar-media__layer avatar-media__image"
      >
    </Transition>

    <!-- Off-screen preloader: fires load before we show anything -->
    <img
      v-if="url && !imageLoaded"
      :src="url"
      aria-hidden="true"
      class="avatar-media__preload"
      @load="onLoad"
    >
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

  &__preload {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }
}

.avatar-fade-enter-active,
.avatar-fade-leave-active {
  transition: opacity var(--transition);
}

.avatar-fade-enter-from,
.avatar-fade-leave-to {
  opacity: 0;
}
</style>
