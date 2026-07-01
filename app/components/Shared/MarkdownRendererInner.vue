<script setup lang="ts">
import type { MDCRoot } from '@nuxtjs/mdc'
import { nextTick, onMounted, onUnmounted } from 'vue'
import SharedLinkEmbed from '@/components/LinkEmbed/index.vue'
import ProseImg from '@/components/Shared/ProseImg.vue'
import { useBulkDataUser } from '@/composables/useDataUser'
import { useExternalLinkGuard } from '@/composables/useExternalLinkGuard'
import { groupImagesAST } from '@/lib/imageGrouping'
import { transformLinkEmbeds } from '@/lib/linkEmbedAST'
import { extractMentionIds, processMarkdown } from '@/lib/markdownProcessors'
import { wrapTablesAST } from '@/lib/tableWrapping'
import { isExternalUrl } from '@/lib/utils/externalLink'
import SharedAudioEmbed from './AudioEmbed.global.vue'
import SharedChannelMention from './ChannelMention.global.vue'
import MarkdownLightbox from './MarkdownLightbox.vue'
import SharedUserMention from './UserMention.global.vue'

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

const emit = defineEmits<{
  parsed: []
}>()

// MDCRenderer.components prop is typed as Record<string, string | DefineComponent<any,any,any>>.
// Casting via unknown as Record<string, string> satisfies the type (string is a subtype of the union)
// while keeping the actual runtime value as the component object.
// 'img' key matches the AST node tag so MDCRenderer uses ProseImg for every
// markdown image, giving us lazy loading and a fade-in without DOM post-processing.
const mdcComponents = { SharedUserMention, SharedChannelMention, SharedLinkEmbed, img: ProseImg, audio: SharedAudioEmbed } as unknown as Record<string, string>

const container = useTemplateRef('container')

const mentionIds = computed(() => extractMentionIds(props.md))
useBulkDataUser(mentionIds)

const { handleContentClick } = useExternalLinkGuard()

const processedMarkdown = computed(() => processMarkdown(props.md))

function applyTransforms(body: MDCRoot | undefined): MDCRoot | undefined {
  if (!body)
    return body
  let result = groupImagesAST(body as Parameters<typeof groupImagesAST>[0])
  result = transformLinkEmbeds(result as Parameters<typeof transformLinkEmbeds>[0]) as typeof result
  result = wrapTablesAST(result as Parameters<typeof wrapTablesAST>[0]) as typeof result
  return result as unknown as MDCRoot
}

// Parsed result - null until the first parse completes after mount.
// Using a regular ref (not top-level await) so this component is never in a
// half-mounted async-setup state when the parent Suspense is torn down, which
// caused "instance is null" / "subTree of null" crashes in Vue's runtime.
const parsed = shallowRef<{ body: MDCRoot | undefined, data: Record<string, unknown> } | null>(null)

let destroyed = false
type ParseMarkdownFn = (source: string, opts: object) => Promise<{ body: MDCRoot, data: Record<string, unknown> }>
let parseMarkdownFn: ParseMarkdownFn | null = null

async function runParse(val: string) {
  if (!parseMarkdownFn) {
    const mod = await import('@nuxtjs/mdc/runtime')
    if (destroyed)
      return
    parseMarkdownFn = mod.parseMarkdown as unknown as ParseMarkdownFn
  }
  const result = await parseMarkdownFn!(val, { toc: false, contentHeading: false })
  if (destroyed)
    return
  parsed.value = {
    body: applyTransforms(result.body),
    data: result.data as Record<string, unknown>,
  }
  emit('parsed')
  await nextTick()
  setupVideoErrorHandlers()
  setupExternalLinkTargets()
}

function setupVideoErrorHandlers() {
  if (!container.value)
    return
  container.value.querySelectorAll('.md-video-embed video').forEach((video) => {
    const el = video as HTMLVideoElement
    // blob: URLs are session-scoped and always broken on reload
    if (el.src.startsWith('blob:') || el.getAttribute('src')?.startsWith('blob:')) {
      markVideoMissing(el)
      return
    }
    el.addEventListener('error', () => markVideoMissing(el), { once: true })
  })
}

function setupExternalLinkTargets() {
  if (!container.value)
    return
  container.value.querySelectorAll('a[href]').forEach((el) => {
    const anchor = el as HTMLAnchorElement
    const href = anchor.getAttribute('href')
    if (href && isExternalUrl(href)) {
      anchor.setAttribute('target', '_blank')
      anchor.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

function markVideoMissing(video: HTMLVideoElement) {
  const wrapper = video.closest('.md-video-embed') as HTMLElement | null
  if (!wrapper || wrapper.classList.contains('md-video-missing'))
    return
  wrapper.classList.add('md-video-missing')
  wrapper.innerHTML = '<span class="md-missing-label">Missing or deleted media</span>'
}

onMounted(() => {
  runParse(processedMarkdown.value)
})

onUnmounted(() => {
  destroyed = true
})

watch(processedMarkdown, (val) => {
  runParse(val)
})
</script>

<template>
  <div ref="container" class="md-renderer-inner" @click="handleContentClick">
    <MDCRenderer
      v-if="parsed?.body"
      :body="parsed.body"
      :data="parsed.data ?? {}"
      :tag="props.tag"
      :class="`typeset ${props.extraClass}`"
      :components="mdcComponents"
    />
    <MarkdownLightbox v-if="props.md" :markdown="props.md" :container="container" />
  </div>
</template>

<style lang="scss" scoped>
/* Consecutive solo-image paragraphs grouped into a flex row */
:deep(.md-image-group) {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-xs);
  margin: var(--space-xs) 0;

  > p,
  > img,
  > .prose-img-skeleton,
  > .prose-img-missing,
  > div.md-video-embed {
    min-width: 0;
    margin: 0;
  }

  > p > img,
  > p > .prose-img-skeleton,
  > p > .prose-img-missing,
  > img,
  > .prose-img-skeleton,
  > .prose-img-missing {
    width: 100%;
    max-height: 240px;
    max-width: none;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: var(--border-radius-s);
  }

  // Video tiles inside the group: cover-crop to match image tiles, hide native controls.
  > div.md-video-embed {
    display: block;
    overflow: hidden;
    border-radius: var(--border-radius-s);
    cursor: pointer;
    aspect-ratio: 16 / 9;
    max-height: 240px;
    max-width: none;
    position: relative;

    > video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      pointer-events: none;
    }

    // Centered play icon overlay
    &::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 44px;
      height: 44px;
      background: rgba(0, 0, 0, 0.55)
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpolygon points='9%2C6 9%2C18 19%2C12' fill='white'/%3E%3C/svg%3E")
        center / 18px no-repeat;
      border-radius: 50%;
      pointer-events: none;
    }
  }

  // 2-image group: switch to 2 equal columns so they fill the row.
  &[data-count='2'] {
    grid-template-columns: repeat(2, 1fr);
  }

  // 1 image left over in the last row (count % 3 == 1): span it full width.
  // :last-child:nth-child(3n+1) matches exactly that case.
  > :last-child:nth-child(3n + 1) {
    grid-column: 1 / -1;
  }

  // 2 images left over in the last row (count % 3 == 2, e.g. 5, 8, 11...):
  // A 3-col grid gives each orphan 1/3 width with the last third empty - looks bad.
  // Fix: switch to a 6-col grid where each item spans 2 cols (still 3 per row),
  // and the last two orphans each span 3 cols (equal halves of the row).
  &[data-count='5'],
  &[data-count='8'],
  &[data-count='11'],
  &[data-count='14'] {
    grid-template-columns: repeat(6, 1fr);

    > p,
    > img,
    > .prose-img-skeleton,
    > .prose-img-missing,
    > div.md-video-embed {
      grid-column: span 2;
    }

    > :nth-last-child(-n + 2) {
      grid-column: span 3;
    }
  }

  @media (max-width: 600px) {
    grid-template-columns: repeat(2, 1fr);

    // Reset the 6-col span overrides applied for 3n+2 counts - on mobile
    // we use a plain 2-col grid so items must auto-place without forced spans.
    &[data-count='5'],
    &[data-count='8'],
    &[data-count='11'],
    &[data-count='14'] {
      grid-template-columns: repeat(2, 1fr);

      > p,
      > img,
      > .prose-img-skeleton,
      > .prose-img-missing,
      > div.md-video-embed {
        grid-column: unset;
      }

      > :nth-last-child(-n + 2) {
        grid-column: unset;
      }
    }

    > p > img,
    > p > .prose-img-skeleton,
    > p > .prose-img-missing,
    > img,
    > .prose-img-skeleton,
    > .prose-img-missing,
    > div.md-video-embed {
      max-height: 40vh;
      aspect-ratio: 4 / 3;
    }

    // Odd last child on mobile: span both columns.
    > :last-child:nth-child(2n + 1) {
      grid-column: 1 / -1;

      > img,
      img,
      > .prose-img-missing {
        aspect-ratio: 16 / 9;
        max-height: 30vh;
      }
    }

    // Even last child fits perfectly - no spanning.
    > :last-child:nth-child(2n) {
      grid-column: unset;
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
:deep(.md-youtube-embed) {
  display: flex;
  justify-content: flex-start;
  margin: var(--space-s) 0;

  iframe {
    position: relative;
    max-width: 100%;
    border-radius: var(--border-radius-s);
    aspect-ratio: 16 / 9;
    height: auto;
  }
}

/* Video embed produced by processVideoDirectives */
:deep(.md-video-embed) {
  display: flex;
  justify-content: center;
  margin: var(--space-s) 0;

  video {
    max-width: 100%;
    max-height: 60vh;
    border-radius: var(--border-radius-s);
  }

  &.md-video-missing {
    aspect-ratio: 16 / 9;
    max-height: 240px;
    background-color: var(--color-bg-raised);
    background-image: url('/landing/noise.gif');
    background-size: 120px;
    background-repeat: repeat;
    border-radius: var(--border-radius-s);
    align-items: center;
    justify-content: center;
  }
}

/* Audio embed produced by processAudioDirectives (rendered as AudioPlayer) */
:deep(.md-audio-embed) {
  margin: var(--space-s) 0;
  max-width: 420px;
}

:deep(.md-missing-label) {
  font-size: var(--font-size-xs);
  color: var(--color-text-lighter);
  background: rgba(0, 0, 0, 0.45);
  padding: var(--space-xxs) var(--space-xs);
  border-radius: var(--border-radius-s);
}

/* KaTeX math produced by rehype-katex */
:deep(.katex-display) {
  overflow-x: auto;
  overflow-y: hidden;
  padding: var(--space-xs) 0;
}

/* Data file attachment card produced by processDataFileDirectives */
:deep(.md-datafile-card) {
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

/* Scroll wrapper injected around bare <table> elements after MDC render */
:deep(.table-scroll-wrapper) {
  display: block;
  width: 100%;
  contain: inline-size;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  margin: var(--space-xs) 0;
  position: relative;
}

/* Typeset styles for rendered markdown */
.typeset {
  display: block;
  width: 100%;
  overflow-wrap: break-word;
  word-break: break-word; // Safari fallback - break-word is non-standard but widely supported

  :deep(table) {
    display: table;
    border-collapse: collapse;
    margin: 0;
    min-width: 100%;
    table-layout: auto;
  }

  :deep(table th),
  :deep(table td) {
    padding: var(--space-xs) var(--space-s);
    border: 1px solid var(--color-border);
    text-align: left;
    white-space: normal;
    word-break: break-word;
    min-width: 80px;
  }

  :deep(table th) {
    background-color: var(--color-bg-raised);
    font-weight: 600;
  }

  .contains-task-list {
    .task-list-item {
      padding-left: 0px;

      input[type='checkbox'] {
        width: 16px;
        height: 16px;
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        border: 1px solid var(--color-border-strong);
        background-color: var(--color-bg-raised);
        margin-bottom: -2px;
        border-radius: 4px;
        cursor: default;
        position: relative;

        &:checked {
          background-color: var(--color-accent);
          border-color: var(--color-accent);

          &:before {
            content: '✓';
            color: var(--color-text-invert);
            font-size: var(--font-size-s);
            position: absolute;
            font-weight: 800;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
          }
        }
      }

      &::before {
        display: none;
      }
    }
  }
}
</style>
