<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const props = defineProps<{
  url: string
  /** Constrain thumbnail to IRC-mode image dimensions (72x48px) */
  small?: boolean
}>()

// Extract video ID from any supported YouTube URL format
function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be')
      return u.pathname.slice(1).split('?')[0] ?? null
    if (u.hostname.endsWith('youtube.com')) {
      if (u.pathname.startsWith('/shorts/'))
        return u.pathname.split('/')[2] ?? null
      return u.searchParams.get('v')
    }
  }
  catch {}
  return null
}

const videoId = computed(() => extractVideoId(props.url))
const playing = ref(false)
const title = ref<string | null>(null)
const thumbError = ref(false)

const thumbnailUrl = computed(() =>
  videoId.value ? `https://img.youtube.com/vi/${videoId.value}/hqdefault.jpg` : null,
)
const embedUrl = computed(() =>
  videoId.value ? `https://www.youtube.com/embed/${videoId.value}?autoplay=1` : null,
)

onMounted(async () => {
  if (!videoId.value)
    return
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId.value}`)}&format=json`
    const res = await fetch(oembedUrl)
    if (res.ok) {
      const json = await res.json() as { title?: string }
      title.value = json.title ?? null
    }
  }
  catch {}
})
</script>

<template>
  <div v-if="videoId" class="yt-embed">
    <!-- Thumbnail state: the img sizes naturally like any other chat image embed -->
    <div v-if="!playing" class="yt-embed__preview" @click="playing = true">
      <div v-if="thumbError" class="yt-embed__thumb-fallback">
        <Icon name="ph:youtube-logo" size="32" />
      </div>
      <img
        v-else
        :src="thumbnailUrl!"
        alt=""
        class="yt-embed__thumb" :class="[{ 'yt-embed__thumb--small': small }]"
        @error="thumbError = true"
      >
      <div class="yt-embed__play-btn">
        <Icon name="ph:play-fill" size="20" />
      </div>
    </div>
    <iframe
      v-else
      :src="embedUrl!"
      class="yt-embed__frame"
      frameborder="0"
      allowfullscreen
      allow="autoplay; encrypted-media; picture-in-picture"
    />
    <div v-if="title && !playing && !small" class="yt-embed__title">
      {{ title }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.yt-embed {
  display: inline-flex;
  flex-direction: column;
  gap: var(--space-xxs);

  &__preview {
    // No fixed size - container wraps the image naturally, just like <img> embeds do
    position: relative;
    display: inline-block;
    line-height: 0;
    border-radius: var(--border-radius-s);
    overflow: hidden;
    border: 1px solid var(--color-border-weak);
    cursor: pointer;
    background: var(--color-bg-lowered);

    &:hover .yt-embed__play-btn {
      background: rgba(0, 0, 0, 0.65);
    }
  }

  &__thumb {
    display: block;
    max-width: 240px;
    max-height: 180px;
    object-fit: cover;

    &--small {
      max-width: 72px;
      max-height: 48px;
    }
  }

  &__thumb-fallback {
    width: 120px;
    height: 68px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-lighter);
  }

  &__play-btn {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    transition: background var(--transition);
  }

  &__frame {
    display: block;
    width: 320px;
    height: 180px;
    border-radius: var(--border-radius-s);
    border: 1px solid var(--color-border-weak);
  }

  &__title {
    font-size: var(--font-size-xs);
    color: var(--color-text-light);
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
