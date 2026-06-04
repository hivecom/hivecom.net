<script setup lang="ts">
import type { MediaItem } from '@/components/Shared/Lightbox.vue'
import Lightbox from '@/components/Shared/Lightbox.vue'

const props = defineProps<Props>()

interface Props {
  markdown: string
  // May be a raw HTMLElement or a Vue component instance (e.g. when ref is on a VUI wrapper)
  container: HTMLElement | { $el: HTMLElement } | null
}

const IMAGE_URL_SOURCE = String.raw`!\[.*?\]\((.*?\.(?:jpe?g|png|webp|gif)(?:\?[^)]*)?)\)`
const VIDEO_URL_SOURCE = String.raw`:::video\s*\{[^}]*src="([^"]+)"[^}]*\}\s*:::`

// Extract all media (images and videos) in document order.
const mediaItems = computed((): MediaItem[] => {
  const items: { pos: number, item: MediaItem }[] = []

  for (const m of props.markdown.matchAll(new RegExp(IMAGE_URL_SOURCE, 'gi')))
    items.push({ pos: m.index!, item: { type: 'image', url: m[1]! } })
  for (const m of props.markdown.matchAll(new RegExp(VIDEO_URL_SOURCE, 'gi')))
    items.push({ pos: m.index!, item: { type: 'video', url: m[1]! } })

  items.sort((a, b) => a.pos - b.pos)
  return items.map(i => i.item)
})

const lightboxRef = useTemplateRef('lightboxRef')

// Listen for clicks inside this instance's container only.
useEventListener('click', (event) => {
  const target = event.target as HTMLElement

  const el = props.container && '$el' in props.container ? props.container.$el : props.container
  if (!el?.contains(target))
    return

  if (target.tagName === 'IMG' && !target.classList.contains('ignored')) {
    const src = target.getAttribute('src')
    const index = mediaItems.value.findIndex(m => m.type === 'image' && m.url === src)
    if (index !== -1)
      lightboxRef.value?.open(index)
  }
  else if (target.tagName === 'DIV' && target.classList.contains('md-video-embed') && target.closest('.md-image-group')) {
    // Grouped videos: inner video has pointer-events: none so the click lands on the div wrapper.
    const video = target.querySelector('video')
    const src = video?.getAttribute('src') ?? null
    const index = mediaItems.value.findIndex(m => m.type === 'video' && m.url === src)
    if (index !== -1)
      lightboxRef.value?.open(index)
  }
})
</script>

<template>
  <Lightbox ref="lightboxRef" :items="mediaItems" />
</template>
