<script setup lang="ts">
import type { MDCRoot } from '@nuxtjs/mdc'
import { useBulkDataUser } from '@/composables/useDataUser'
import { groupImagesAST } from '@/lib/imageGrouping'
import { extractMentionIds, processMarkdown } from '@/lib/markdownProcessors'
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

// MDCRenderer.components prop is typed as Record<string, string | DefineComponent<any,any,any>>.
// Casting via unknown as Record<string, string> satisfies the type (string is a subtype of the union)
// while keeping the actual runtime value as the component object.
const mdcComponents = { SharedUserMention } as unknown as Record<string, string>

const container = useTemplateRef('container')

const mentionIds = computed(() => extractMentionIds(props.md))
useBulkDataUser(mentionIds)

const processedMarkdown = computed(() => processMarkdown(props.md))

// Top-level await - makes this a genuine async component that Suspense can track
const { parseMarkdown } = await import('@nuxtjs/mdc/runtime')

function applyGrouping(body: MDCRoot | undefined): MDCRoot | undefined {
  if (!body)
    return body
  return groupImagesAST(body as Parameters<typeof groupImagesAST>[0]) as unknown as MDCRoot
}

const rawParsed = await parseMarkdown(processedMarkdown.value, { toc: false, contentHeading: false })
const parsed = shallowReactive({
  body: applyGrouping(rawParsed.body),
  data: rawParsed.data,
})

watch(processedMarkdown, async (val) => {
  const result = await parseMarkdown(val, { toc: false, contentHeading: false })
  parsed.body = applyGrouping(result.body)
  parsed.data = result.data
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
  > img {
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
    > img {
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
      > img {
        grid-column: unset;
      }

      > :nth-last-child(-n + 2) {
        grid-column: unset;
      }
    }

    > p > img,
    > img {
      max-height: 40vh;
      aspect-ratio: 4 / 3;
    }

    // Odd last child on mobile: span both columns.
    > :last-child:nth-child(2n + 1) {
      grid-column: 1 / -1;

      > img,
      img {
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
  justify-content: center;
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
    border-radius: var(--border-radius-s);
  }
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

/* Typeset scrolls horizontally for wide tables */
.typeset {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  overflow-wrap: break-word;
  word-break: break-word; // Safari fallback - break-word is non-standard but widely supported

  :deep(table) {
    display: table;
    border-collapse: collapse;
    margin: var(--space-xs) 0;
    width: fit-content;
    min-width: 100%;
    table-layout: fixed;
    position: relative;
  }

  :deep(table th),
  :deep(table td) {
    padding: var(--space-xs) var(--space-s);
    border: 1px solid var(--color-border);
    text-align: left;
    white-space: nowrap;
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
