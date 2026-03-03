<script setup lang="ts">
import { Button, Flex, Modal } from '@dolanske/vui'

interface Props {
  markdown: string
}

const props = defineProps<Props>()

const imageUrls = computed(() => {
  const regex = /!\[.*?\]\((.*?\.(?:jpe?g|png|webp)(?:\?[^)]*)?)\)/gi
  const urls: string[] = []
  let match = regex.exec(props.markdown)
  while (match !== null) {
    urls.push(match[1]!)
    match = regex.exec(props.markdown)
  }
  return urls
})

const activeIndex = ref(-1)
const activeUrl = computed(() => imageUrls.value[activeIndex.value] ?? null)
const isOpen = computed(() => activeIndex.value !== -1)

const hasPrev = computed(() => activeIndex.value > 0)
const hasNext = computed(() => activeIndex.value < imageUrls.value.length - 1)

function open(index: number) { activeIndex.value = index }
function close() { activeIndex.value = -1 }
function prev() {
  if (hasPrev.value)
    activeIndex.value--
}
function next() {
  if (hasNext.value)
    activeIndex.value++
}

function register() {
  useEventListener('click', (event) => {
    const target = event.target as HTMLElement
    if (target.tagName === 'IMG' && target.closest('.typeset')?.contains(target)) {
      const src = target.getAttribute('src')
      const index = imageUrls.value.indexOf(src ?? '')
      if (index !== -1)
        open(index)
    }
  })
}

// Parent component will call this when MDrenderer has finished rendering the DOM elements
defineExpose({
  register,
})
</script>

<template>
  <Modal class="md-lightbox" size="screen" :open="isOpen" centered @close="close">
    <div class="md-lightbox__img-wrap">
      <img v-if="activeUrl" :src="activeUrl" @click="close">
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
  background-color: red;

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
      // 136 is composed of the vertical header & footer which are both 60 pixels
      // + the default 16px padding on the entire modal content
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
