<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const props = defineProps<{
  url: string
  /** Constrain thumbnail to IRC-mode image dimensions (72x48px) */
  small?: boolean
  /** Render thumbnail inline at 1em height, matching IRC inline image mode */
  inline?: boolean
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
  <component
    :is="inline ? 'span' : 'div'"
    v-if="videoId"
    class="yt-embed"
    :class="{ 'yt-embed--inline': inline,
              'yt-embed--small-row': small }"
  >
    <!-- Thumbnail state: the img sizes naturally like any other chat image embed -->
    <component :is="inline ? 'span' : 'div'" v-if="!playing" class="yt-embed__preview" @click="playing = true">
      <div v-if="thumbError" class="yt-embed__thumb-fallback">
        <Icon name="ph:youtube-logo" size="32" />
      </div>
      <img
        v-else
        :src="thumbnailUrl!"
        alt=""
        class="yt-embed__thumb"
        :class="{ 'yt-embed__thumb--small': small,
                  'yt-embed__thumb--inline': inline }"
        @error="thumbError = true"
      >
      <span class="yt-embed__play-btn">
        <Icon name="ph:play-fill" size="20" />
      </span>
    </component>
    <iframe
      v-else
      :src="embedUrl!"
      class="yt-embed__frame"
      frameborder="0"
      allowfullscreen
      allow="autoplay; encrypted-media; picture-in-picture"
    />
    <div v-if="title && !playing" class="yt-embed__title" @click="playing = true">
      {{ title }}
    </div>
  </component>
</template>

<style scoped lang="scss">
.yt-embed {
  display: inline-flex;
  flex-direction: column;
  gap: var(--space-xxs);

  &--small-row {
    display: inline;

    .yt-embed__preview {
      vertical-align: middle;
    }

    .yt-embed__title {
      display: inline;
      flex: none;
      min-width: 0;
      margin-left: var(--space-xxs);
      white-space: normal;
      overflow: visible;
      text-overflow: clip;
      vertical-align: middle;
    }
  }

  &--inline {
    display: inline-block;
    vertical-align: middle;
    height: 1em;

    .yt-embed__preview {
      height: 100%;
      width: auto;
      line-height: 0;
    }
  }

  &__preview {
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
      max-height: 1.5em;
    }

    &--inline {
      height: 100%;
      width: auto;
      max-width: none;
      max-height: none;
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
    font-size: inherit;
    color: var(--color-text-lightest);
    cursor: pointer;
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &:hover {
      color: var(--color-text-light);
    }
  }
}
</style>
