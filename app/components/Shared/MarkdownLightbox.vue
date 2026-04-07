<script setup lang="ts">
import { Button, Flex, Modal } from '@dolanske/vui'

const props = defineProps<Props>()

const IMAGE_URL_SOURCE = String.raw`!\[.*?\]\((.*?\.(?:jpe?g|png|webp|gif)(?:\?[^)]*)?)\)`

interface Props {
  markdown: string
  container: HTMLElement | null
}

// Extract image URLs from the markdown content
const imageUrls = computed(() => {
  return Array.from(props.markdown.matchAll(new RegExp(IMAGE_URL_SOURCE, 'gi')), m => m[1]!)
})

const activeIndex = ref(-1)
const activeUrl = computed(() => imageUrls.value[activeIndex.value] ?? null)
const isOpen = computed(() => activeIndex.value !== -1)

const hasPrev = computed(() => activeIndex.value > 0)
const hasNext = computed(() => activeIndex.value < imageUrls.value.length - 1)

// Track slide direction so the transition CSS knows which way to animate.
// Must be set before mutating activeIndex so Vue picks up the right classes.
type SlideDir = 'left' | 'right'
const slideDir = ref<SlideDir>('left')

// Lightbox UI control methods
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

// Listen for clicks on any <img> inside this instance's own container only.
// Scoping by container ref ensures that when many MarkdownLightbox instances are on
// the same page, only the one that owns the clicked image responds.
useEventListener('click', (event) => {
  const target = event.target as HTMLElement

  if (!props.container?.contains(target))
    return

  if (target.tagName === 'IMG' && !target.classList.contains('ignored')) {
    const src = target.getAttribute('src')
    const index = imageUrls.value.indexOf(src ?? '')

    if (index !== -1) {
      open(index)
    }
  }
})

useEventListener('keydown', (event) => {
  if (!isOpen.value)
    return

  if (event.key === 'Escape') {
    close()
  }
  else if (event.key === 'ArrowLeft') {
    prev()
  }
  else if (event.key === 'ArrowRight') {
    next()
  }
})

// Listen for swipe events - use onSwipeEnd so it fires exactly once per gesture,
// not on every touch-move frame like whenever(isSwiping) would.
const imageWrap = useTemplateRef('imageWrap')
useSwipe(imageWrap, {
  onSwipeEnd(_e, direction) {
    if (direction === 'left') {
      next()
    }
    else if (direction === 'right') {
      prev()
    }
  },
})
</script>

<template>
  <Modal class="md-lightbox" size="screen" :open="isOpen" centered @close="close">
    <div ref="imageWrap" class="md-lightbox__img-wrap">
      <Transition :name="`md-lightbox-slide-${slideDir}`">
        <div v-if="activeUrl" :key="activeUrl" class="md-lightbox__slide" @click.self="close">
          <img class="ignored" :src="activeUrl">
        </div>
      </Transition>
    </div>

    <Flex v-if="imageUrls.length > 1" x-center gap="l" class="md-lightbox-nav" y-center>
      <Button size="s" square :disabled="!hasPrev" :variant="hasPrev ? 'fill' : 'gray'" @click="prev">
        <Icon name="ph:arrow-left" />
      </Button>
      <span>{{ activeIndex + 1 }} / {{ imageUrls.length }}</span>
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
