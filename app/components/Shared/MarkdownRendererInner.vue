<script setup lang="ts">
import { useBulkDataUser } from '@/composables/useDataUser'
import { groupImages } from '@/lib/imageGrouping'
import { extractMentionIds, processMarkdown } from '@/lib/markdownProcessors'
import MarkdownLightbox from './MarkdownLightbox.vue'

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

// Wraps runs of solo-image <p> elements in .md-image-group divs.
// groupImages() operates on a direct container element - pass the .typeset node.
function runGroupImages(root: HTMLElement | null) {
  if (!root)
    return
  const typeset = root.querySelector('.typeset')
  if (typeset instanceof HTMLElement)
    groupImages(typeset)
}

const container = useTemplateRef('container')

const mentionIds = computed(() => extractMentionIds(props.md))
useBulkDataUser(mentionIds)

const processedMarkdown = computed(() => processMarkdown(props.md))

// Top-level await - makes this a genuine async component that Suspense can track
const { parseMarkdown } = await import('@nuxtjs/mdc/runtime')
const parsed = shallowReactive(await parseMarkdown(processedMarkdown.value, { toc: false, contentHeading: false }))

watch(processedMarkdown, async (val) => {
  const result = await parseMarkdown(val, { toc: false, contentHeading: false })
  parsed.body = result.body
  parsed.data = result.data
  await nextTick()
  runGroupImages(container.value)
})

// MutationObserver is more reliable than onMounted+nextTick here because
// MDCRenderer (a nuxt-mdc child) does its own async rendering - by the time
// onMounted fires, the .typeset children may not exist yet. The observer
// fires once the subtree actually settles with content.
let observer: MutationObserver | null = null

onMounted(() => {
  const root = container.value
  if (!root)
    return

  // Disconnect before grouping - our own DOM mutations would re-trigger the
  // observer otherwise. The watch on processedMarkdown handles content updates.
  observer = new MutationObserver(() => {
    observer?.disconnect()
    observer = null
    runGroupImages(root)
  })

  observer.observe(root, { childList: true, subtree: true })
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div ref="container" class="md-renderer-inner">
    <MDCRenderer
      v-if="parsed.body"
      :body="parsed.body"
      :data="parsed.data ?? {}"
      :tag="props.tag"
      :class="`typeset ${props.extraClass}`"
    />
    <MarkdownLightbox v-if="props.md" :markdown="props.md" :container="container" />
  </div>
</template>

<style lang="scss">
/* Consecutive solo-image paragraphs grouped into a flex row */
.md-image-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  margin: var(--space-xs) 0;

  > p,
  > img {
    flex: 1 1 0;
    min-width: 0;
    margin: 0;
  }

  > p > img,
  > img {
    width: 100%;
    max-height: 240px;
    max-width: none;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: var(--border-radius-s);
  }

  @media (max-width: 600px) {
    gap: var(--space-s);

    > p,
    > img {
      flex: none;
      width: 100%;
    }

    > p > img,
    > img {
      max-height: 40vh;
      width: 100%;
      aspect-ratio: unset;
      object-fit: cover;
    }
  }
}

/* Non-grouped images: fill width, natural height, no cropping on mobile */
@media (max-width: 600px) {
  .typeset img:not(.md-image-group img) {
    width: 100%;
    height: auto;
    max-height: none;
    aspect-ratio: unset;
    object-fit: unset;
  }
}

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

/* Video embed produced by processVideoDirectives */
.md-video-embed {
  display: flex;
  justify-content: center;
  margin: var(--space-s) 0;

  video {
    max-width: 100%;
    border-radius: var(--border-radius-s);
  }
}

/* KaTeX math produced by rehype-katex */
.katex-display {
  overflow-x: auto;
  overflow-y: hidden;
  padding: var(--space-xs) 0;
}

/* Data file attachment card produced by processDataFileDirectives */
.md-datafile-card {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-s);
  background-color: var(--color-bg-raised);
  padding: var(--space-xs) var(--space-s);
  margin: var(--space-xs) 0;

  .md-datafile-card__icon {
    font-family: monospace;
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    flex-shrink: 0;
  }

  .md-datafile-card__name {
    font-size: var(--font-size-xs);
    color: var(--color-text);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .md-datafile-card__link {
    font-size: var(--font-size-xs);
    color: var(--color-accent);
    text-decoration: none;
    flex-shrink: 0;

    &:hover {
      text-decoration: underline;
    }
  }
}

/* Make renderer container scrollable for tables */
.md-renderer-inner {
  display: block;
}

/* Typeset scrolls horizontally for wide tables */
.typeset {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

/* Tables with horizontal scrolling */
table {
  display: table;
  border-collapse: collapse;
  margin: var(--space-xs) 0;
  width: fit-content;
  min-width: 100%;
}

table th,
table td {
  padding: var(--space-xs) var(--space-s);
  border: 1px solid var(--color-border);
  text-align: left;
  white-space: nowrap;
  min-width: 80px;
}

table th {
  background-color: var(--color-bg-raised);
  font-weight: 600;
}
</style>
