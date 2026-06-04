<script setup lang="ts">
import { Button, Flex, Modal } from '@dolanske/vui'
import { useLightboxZoom } from '@/composables/useLightboxZoom'

export interface MediaItem {
  type: 'image' | 'video'
  url: string
}

const props = defineProps<{
  items: MediaItem[]
}>()

const activeIndex = ref(-1)
const activeItem = computed(() => props.items[activeIndex.value] ?? null)
const isOpen = computed(() => activeIndex.value !== -1)

const hasPrev = computed(() => activeIndex.value > 0)
const hasNext = computed(() => activeIndex.value < props.items.length - 1)

type SlideDir = 'left' | 'right'
const slideDir = ref<SlideDir>('left')

function open(index: number) {
  activeIndex.value = index
}

function close() {
  activeIndex.value = -1
}

function prev() {
  if (hasPrev.value) {
    slideDir.value = 'right'
    activeIndex.value--
  }
}

function next() {
  if (hasNext.value) {
    slideDir.value = 'left'
    activeIndex.value++
  }
}

useEventListener('keydown', (event) => {
  if (!isOpen.value)
    return

  if (event.key === 'Escape')
    close()
  else if (event.key === 'ArrowLeft')
    prev()
  else if (event.key === 'ArrowRight')
    next()
})

const imageWrap = useTemplateRef('imageWrap')
const zoomTarget = useTemplateRef('zoomTarget')
const { contentStyle, navStyle, reset: resetZoom } = useLightboxZoom(imageWrap, zoomTarget, {
  onNext: next,
  onPrev: prev,
  onClose: close,
  canNext: () => hasNext.value,
  canPrev: () => hasPrev.value,
})

watch(activeIndex, resetZoom)

defineExpose({ open, close })
</script>

<template>
  <Modal class="md-lightbox" size="screen" :open="isOpen" centered @close="close">
    <div ref="imageWrap" class="md-lightbox__img-wrap">
      <Transition :name="`md-lightbox-slide-${slideDir}`">
        <div
          v-if="activeItem"
          :key="activeItem.url"
          class="md-lightbox__slide"
          :style="navStyle"
          @click.self="close"
        >
          <img v-if="activeItem.type === 'image'" ref="zoomTarget" class="ignored" :src="activeItem.url" :style="contentStyle" loading="lazy" decoding="async" draggable="false">
          <video v-else ref="zoomTarget" controls autoplay :src="activeItem.url" :style="contentStyle" draggable="false" />
        </div>
      </Transition>
    </div>

    <Flex v-if="items.length > 1" x-center gap="l" class="md-lightbox-nav" y-center>
      <Button size="s" square :disabled="!hasPrev" :variant="hasPrev ? 'fill' : 'gray'" @click="prev">
        <Icon name="ph:arrow-left" />
      </Button>
      <span>{{ activeIndex + 1 }} / {{ items.length }}</span>
      <Button size="s" square :disabled="!hasNext" :variant="hasNext ? 'fill' : 'gray'" @click="next">
        <Icon name="ph:arrow-right" />
      </Button>
    </Flex>
  </Modal>
</template>

<style lang="scss">
.md-lightbox {
  // 136 is composed of the vertical header & footer which are both 60 pixels
  // + the default 16px padding on the entire modal content
  --height: calc(100vh - 136px);
  --width: calc(100vw - 32px);

  &__img-wrap {
    height: var(--height);
    width: var(--width);
    position: relative;
    overflow: hidden;
    user-select: none;
    touch-action: none;
  }

  &__slide {
    display: flex;
    justify-content: center;
    align-items: center;
    height: var(--height);
    width: var(--width);

    img {
      border-radius: var(--border-radius-m);
      max-height: var(--height);
      max-width: var(--width);
      display: block;
      margin: auto;
    }

    video {
      border-radius: var(--border-radius-m);
      max-height: var(--height);
      max-width: var(--width);
      display: block;
      margin: auto;
    }
  }

  & > .vui-card .vui-card-content > div {
    display: contents !important;
  }

  span {
    font-variant-numeric: tabular-nums;
  }

  .md-lightbox-nav {
    height: 60px;
  }
}

// Slide transitions - global so Vue's runtime-injected transition classes match
.md-lightbox-slide-left-enter-active,
.md-lightbox-slide-left-leave-active,
.md-lightbox-slide-right-enter-active,
.md-lightbox-slide-right-leave-active {
  transition:
    transform 0.25s ease,
    opacity 0.25s ease;
  position: absolute;
  inset: 0;
}

// Slide left: new enters from right, old exits to left
.md-lightbox-slide-left-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.md-lightbox-slide-left-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

// Slide right: new enters from left, old exits to right
.md-lightbox-slide-right-enter-from {
  transform: translateX(-100%);
  opacity: 0;
}

.md-lightbox-slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
