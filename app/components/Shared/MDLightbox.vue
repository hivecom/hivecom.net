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

// Lightbox UI control methods
function open(index: number) {
  activeIndex.value = index
}

function close() {
  activeIndex.value = -1
}

function prev() {
  if (hasPrev.value) {
    activeIndex.value--
  }
}

function next() {
  if (hasNext.value) {
    activeIndex.value++
  }
}

// Listen for clicks on any <img> inside this instance's own container only.
// Scoping by container ref ensures that when many MDLightbox instances are on
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
</script>

<template>
  <Modal class="md-lightbox" size="screen" :open="isOpen" centered @close="close">
    <div class="md-lightbox__img-wrap">
      <img v-if="activeUrl" class="ignored" :src="activeUrl" @click="close">
    </div>

    <Flex v-if="imageUrls.length > 1" x-center gap="l" class="md-lightbox-nav" y-center>
      <Button size="s" square :disabled="!hasPrev" @click="prev">
        <Icon name="ph:arrow-left" />
      </Button>
      <span>{{ activeIndex + 1 }} / {{ imageUrls.length }}</span>
      <Button size="s" square :disabled="!hasNext" @click="next">
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
</style>
