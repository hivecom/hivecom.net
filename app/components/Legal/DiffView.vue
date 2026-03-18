<script setup lang="ts">
import type { LegalCollectionItem } from '@nuxt/content'
import { Button, Flex, Modal, Spinner } from '@dolanske/vui'
import { createTwoFilesPatch } from 'diff'
import { html as diff2html } from 'diff2html'
import { stringify } from 'minimark/stringify'
import { ref, watch } from 'vue'

const props = defineProps<{
  fromPath: string
  toPath: string
  fromLabel: string
  toLabel: string
}>()

const open = defineModel<boolean>('open', { default: false })

// Module-scoped to avoid re-compilation on every call
const DIFF_ROW_RE = /<tr[^>]*>[\s\S]*?<\/tr>/g
const DIFF_CONTENT_RE = /class="d2h-code-line-ctn"[^>]*>([\s\S]*?)<\/span>/
const DIFF_TAG_RE = /<[^>]+>/g

const loading = ref(false)
const error = ref<string | null>(null)
const diffHtml = ref<string | null>(null)
const changeNote = ref<string | null>(null)

function bodyToText(item: LegalCollectionItem): string {
  try {
    return stringify({ type: 'minimark', value: item.body.value }, { format: 'markdown/html' })
  }
  catch {
    return ''
  }
}

async function generateDiff() {
  if (diffHtml.value)
    return

  loading.value = true
  error.value = null

  try {
    const [fromDoc, toDoc] = await Promise.all([
      queryCollection('legal').path(props.fromPath).first(),
      queryCollection('legal').path(props.toPath).first(),
    ])

    if (!fromDoc || !toDoc) {
      error.value = 'One or both documents could not be loaded.'
      return
    }

    changeNote.value = toDoc.note ?? null

    const fromText = bodyToText(fromDoc)
    const toText = bodyToText(toDoc)

    const patch = createTwoFilesPatch(
      props.fromLabel,
      props.toLabel,
      fromText,
      toText,
      undefined,
      undefined,
      { context: 0 },
    )

    // Don't pass colorScheme - we handle all coloring ourselves to avoid
    // d2h-light-color-scheme / d2h-dark-color-scheme interfering.
    let html = diff2html(patch, {
      outputFormat: 'line-by-line',
      drawFileList: false,
      renderNothingWhenEmpty: false,
      diffStyle: 'word',
    })

    // Strip rows where an added/removed line is empty (blank line additions/removals).
    // Context empty lines (unchanged) are kept - they preserve visual spacing.
    DIFF_ROW_RE.lastIndex = 0
    html = html.replace(DIFF_ROW_RE, (row) => {
      // Only consider ins/del rows - skip context and hunk header rows.
      if (!row.includes('d2h-ins') && !row.includes('d2h-del'))
        return row
      // Extract the content span and strip tags to see if there's actual text.
      const contentMatch = row.match(DIFF_CONTENT_RE)
      if (!contentMatch)
        return row
      const innerText = (contentMatch[1] ?? '').replace(DIFF_TAG_RE, '').trim()
      return innerText === '' ? '' : row
    })

    diffHtml.value = html
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to generate diff.'
  }
  finally {
    loading.value = false
  }
}

watch(open, (val) => {
  if (val)
    void generateDiff()
})

watch([() => props.fromPath, () => props.toPath], () => {
  diffHtml.value = null
  changeNote.value = null
})
</script>

<template>
  <Modal
    :open="open"
    size="screen"
    :card="{ headerSeparator: true,
             footerSeparator: true }"
    :can-dismiss="true"
    @close="open = false"
  >
    <template #header>
      <Flex column gap="xs">
        <Flex y-center gap="s">
          <span class="diff-view__from-label">{{ fromLabel }}</span>
          <Icon name="ph:arrow-right" class="diff-view__arrow" />
          <span class="diff-view__to-label">{{ toLabel }}</span>
        </Flex>
        <p v-if="changeNote" class="diff-view__note">
          {{ changeNote }}
        </p>
      </Flex>
    </template>

    <div class="diff-view__body">
      <Flex v-if="loading" x-center y-center class="diff-view__state">
        <Spinner />
      </Flex>

      <Flex v-else-if="error" x-center y-center class="diff-view__state">
        <p class="diff-view__error-text">
          {{ error }}
        </p>
      </Flex>

      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-else-if="diffHtml" class="diff-view__diff" v-html="diffHtml" />
    </div>

    <template #footer="{ close }">
      <Flex x-end>
        <Button @click="close()">
          Close
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style lang="scss" scoped>
.diff-view {
  &__note {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
    margin: 0;
    font-style: italic;
    max-width: 60ch;
  }

  &__from-label {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
    font-weight: 500;
  }

  &__to-label {
    font-size: var(--font-size-s);
    color: var(--color-text);
    font-weight: 600;
  }

  &__arrow {
    color: var(--color-text-lighter);
    flex-shrink: 0;
  }

  &__body {
    height: 100%;
    overflow: auto;
  }

  &__state {
    min-height: 200px;
  }

  &__error-text {
    color: var(--color-text-red);
    font-size: var(--font-size-s);
  }

  &__diff {
    // Neutralise the color-scheme class diff2html adds to the wrapper.
    // It injects its own light/dark palette via attribute selectors which
    // would fight everything below.
    :deep(.d2h-wrapper) {
      all: unset;
      display: block;
    }

    // File header shows the filename from the patch - not useful here.
    :deep(.d2h-file-header) {
      display: none;
    }

    :deep(.d2h-file-wrapper) {
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-s);
      overflow: hidden;
      margin-bottom: var(--space-s);
    }

    :deep(.d2h-diff-table) {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-family: inherit;
      font-size: var(--font-size-s);
      color: var(--color-text);
    }

    // ---------------------------------------------------------------
    // Line number gutter column
    // Classes land on the td itself: "d2h-code-linenumber d2h-cntx" etc.
    // ---------------------------------------------------------------
    :deep(td.d2h-code-linenumber) {
      width: 60px;
      min-width: 60px;
      text-align: right;
      padding: 3px 8px;
      font-size: var(--font-size-xs);
      color: var(--color-text-lighter);
      border-right: 1px solid var(--color-border);
      background: var(--color-bg-raised);
      user-select: none;
      vertical-align: top;
      white-space: nowrap;
    }

    // ---------------------------------------------------------------
    // Content column
    // ---------------------------------------------------------------
    :deep(td.d2h-code-line) {
      padding: 3px var(--space-s);
      vertical-align: top;
      word-break: break-word;
      white-space: pre-wrap;
      background: var(--color-bg);
    }

    :deep(.d2h-code-line-ctn) {
      white-space: pre-wrap;
      word-break: break-word;
    }

    // ---------------------------------------------------------------
    // Unchanged context rows - td carries d2h-cntx
    // ---------------------------------------------------------------
    :deep(td.d2h-cntx.d2h-code-linenumber) {
      background: var(--color-bg-raised);
    }

    :deep(td.d2h-cntx.d2h-code-line) {
      background: var(--color-bg);
    }

    // ---------------------------------------------------------------
    // Added rows - td carries d2h-ins (with or without d2h-change)
    // ---------------------------------------------------------------
    :deep(td.d2h-ins.d2h-code-linenumber) {
      background: color-mix(in srgb, var(--color-text-green) 18%, var(--color-bg-raised));
      border-right-color: color-mix(in srgb, var(--color-text-green) 30%, var(--color-border));
      color: var(--color-text-green);
    }

    :deep(td.d2h-ins.d2h-code-line) {
      background: color-mix(in srgb, var(--color-text-green) 8%, var(--color-bg));
    }

    // ---------------------------------------------------------------
    // Removed rows - td carries d2h-del (with or without d2h-change)
    // ---------------------------------------------------------------
    :deep(td.d2h-del.d2h-code-linenumber) {
      background: color-mix(in srgb, var(--color-text-red) 18%, var(--color-bg-raised));
      border-right-color: color-mix(in srgb, var(--color-text-red) 30%, var(--color-border));
      color: var(--color-text-red);
    }

    :deep(td.d2h-del.d2h-code-line) {
      background: color-mix(in srgb, var(--color-text-red) 8%, var(--color-bg));
    }

    // ---------------------------------------------------------------
    // Inline word-level highlights (ins/del elements inside the line)
    // ---------------------------------------------------------------
    :deep(td.d2h-ins ins) {
      background: color-mix(in srgb, var(--color-text-green) 35%, transparent);
      color: var(--color-text);
      text-decoration: none;
      border-radius: 2px;
      padding: 0 1px;
    }

    :deep(td.d2h-del del) {
      background: color-mix(in srgb, var(--color-text-red) 35%, transparent);
      color: var(--color-text);
      text-decoration: none;
      border-radius: 2px;
      padding: 0 1px;
    }

    // ---------------------------------------------------------------
    // Hunk header rows (@@ -x,y +x,y @@) - td carries d2h-info
    // Not useful for readers - hide entirely.
    // ---------------------------------------------------------------
    :deep(tr:has(td.d2h-info)) {
      display: none;
    }

    // ---------------------------------------------------------------
    // +/- prefix character - grid so text never flows under the glyph
    // ---------------------------------------------------------------
    :deep(div.d2h-code-line) {
      display: grid;
      grid-template-columns: 1.5ch 1fr;
      align-items: baseline;
      column-gap: var(--space-xs);
    }

    :deep(.d2h-code-line-prefix) {
      user-select: none;
      font-weight: 600;
      line-height: inherit;
    }

    :deep(.d2h-code-line-ctn) {
      min-width: 0;
    }

    :deep(td.d2h-ins .d2h-code-line-prefix) {
      color: var(--color-text-green);
    }

    :deep(td.d2h-del .d2h-code-line-prefix) {
      color: var(--color-text-red);
    }

    :deep(td.d2h-cntx .d2h-code-line-prefix) {
      color: var(--color-text-lighter);
      opacity: 0.5;
    }
  }
}
</style>
