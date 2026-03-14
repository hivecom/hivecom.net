<script setup lang="ts">
import { useBulkUserData } from '@/composables/useCacheUserData'
import { extractMentionIds, processMentions } from '@/lib/markdownProcessors'
import MDLightbox from './MDLightbox.vue'

const props = defineProps({
  tag: {
    type: String,
  },
  extraClass: {
    type: String,
    default: '',
  },
  md: {
    type: String,
    required: true,
  },
})

const mentionIds = computed(() => extractMentionIds(props.md))
useBulkUserData(mentionIds)

const processedMarkdown = computed(() => processMentions(props.md))

// Top-level await - makes this a genuine async component that Suspense can track
const { parseMarkdown } = await import('@nuxtjs/mdc/runtime')
const parsed = shallowReactive(await parseMarkdown(processedMarkdown.value, { toc: false, contentHeading: false }))

watch(processedMarkdown, async (val) => {
  const result = await parseMarkdown(val, { toc: false, contentHeading: false })
  parsed.body = result.body
  parsed.data = result.data
})

const lightbox = useTemplateRef('lightbox')

onMounted(() => {
  nextTick(() => lightbox.value?.register())
})
</script>

<template>
  <div>
    <MDCRenderer
      v-if="parsed.body"
      :body="parsed.body"
      :data="parsed.data ?? {}"
      :tag="props.tag"
      :class="`typeset ${props.extraClass}`"
    />
    <MDLightbox v-if="props.md" ref="lightbox" :markdown="props.md" />
  </div>
</template>

<style lang="scss">
/* YouTube embed produced by processYoutubeDirectives */
.md-youtube-embed {
  display: flex;
  justify-content: center;
  margin: var(--space-s) 0;

  iframe {
    max-width: 100%;
    border-radius: var(--border-radius-s);
    aspect-ratio: 16 / 9;
    height: auto;
  }
}

/* KaTeX math produced by rehype-katex */
.katex-display {
  overflow-x: auto;
  overflow-y: hidden;
  padding: var(--space-xs) 0;
}
</style>
