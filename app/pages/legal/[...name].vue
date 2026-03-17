<script setup>
import { Alert, Button, Divider, Flex, Tooltip } from '@dolanske/vui'
import { formatDateLong } from '@/lib/utils/date'

const name = useRoute().params.name.join('/')

const { data: content } = await useAsyncData(name, async () => {
  return await queryCollection('legal').path(`/legal/${name}`).first()
})

useSeoMeta(() => {
  const legalTitle = content.value
    ? `${content.value.title || name} | Legal`
    : 'Document Not Found'

  return {
    title: legalTitle,
    description: content.value?.description || 'Hivecom legal documentation.',
    ogTitle: legalTitle,
    ogDescription: content.value?.description || 'Hivecom legal documentation.',
  }
})

const today = new Date()
today.setHours(0, 0, 0, 0)

// Detect whether we're viewing a revision (path has 2+ segments, e.g. "terms/2026-12-01")
const nameParts = name.split('/')
const isRevisionPage = nameParts.length > 1

// The base document name (e.g. "terms") for linking back
const baseName = nameParts[0]

// For revision pages, fetch the parent document so we can find the preceding revision
const { data: parentContent } = await useAsyncData(`${baseName}-parent`, async () => {
  if (!isRevisionPage)
    return null
  return await queryCollection('legal').path(`/legal/${baseName}`).first()
})

// For revision pages: is this document not yet in effect?
const isFutureRevision = computed(() => {
  if (!isRevisionPage || !content.value?.date)
    return false
  const d = new Date(content.value.date)
  return !Number.isNaN(d.getTime()) && d >= today
})

// Past revision = is a revision page, not future
const isPastRevision = computed(() => isRevisionPage && !isFutureRevision.value)

const pastRevisions = computed(() => {
  const source = isRevisionPage ? parentContent.value : content.value
  return (source?.revisions ?? []).filter((r) => {
    const d = new Date(r)
    return !Number.isNaN(d.getTime()) && d < today
  })
})

const futureRevisions = computed(() => {
  const source = isRevisionPage ? parentContent.value : content.value
  return (source?.revisions ?? []).filter((r) => {
    const d = new Date(r)
    return !Number.isNaN(d.getTime()) && d >= today
  })
})

const hasRevisions = computed(() => pastRevisions.value.length > 0 || futureRevisions.value.length > 0)

// Diff toggle
const diffOpen = ref(false)

// On the current page: compare most recent past revision -> current.
// On a revision page: compare the revision immediately before this one -> this one.
// If this is the oldest revision, nothing before it to diff against.
const diffFromPath = computed(() => {
  if (!isRevisionPage) {
    const last = pastRevisions.value.at(-1)
    return last ? `/legal/${baseName}/${last}` : null
  }

  const thisDate = content.value?.date
  if (!thisDate)
    return null

  const all = (parentContent.value?.revisions ?? []).toSorted((a, b) => new Date(a).getTime() - new Date(b).getTime())

  const idx = all.indexOf(thisDate)
  return idx > 0 ? `/legal/${baseName}/${all[idx - 1]}` : null
})

const diffToPath = computed(() => `/legal/${name}`)

const diffFromLabel = computed(() => {
  if (!isRevisionPage) {
    const last = pastRevisions.value.at(-1)
    return last ? formatDateLong(last) : ''
  }

  const thisDate = content.value?.date
  if (!thisDate)
    return ''

  const all = (parentContent.value?.revisions ?? []).toSorted((a, b) => new Date(a).getTime() - new Date(b).getTime())

  const idx = all.indexOf(thisDate)
  return idx > 0 ? formatDateLong(all[idx - 1]) : ''
})

const diffToLabel = computed(() => formatDateLong(content.value?.date ?? null))

const canDiff = computed(() => !!diffFromPath.value)

// The note always lives on the "to" document (the newer version being diffed into).
// On the current page and revision pages alike, that's content.value.
const changeNote = computed(() => content.value?.note ?? null)
</script>

<template>
  <div class="container container-m">
    <div class="page legal-page typeset">
      <div v-if="content">
        <h1>{{ content.title || name }}</h1>

        <Flex x-between y-center gap="m" wrap>
          <div>
            <p class="legal-page__last-updated">
              <template v-if="isFutureRevision">
                Effective on {{ formatDateLong(content.date) }}
              </template>
              <template v-else-if="isPastRevision">
                Previously effective from {{ formatDateLong(content.date) }} -
                <NuxtLink :to="`/legal/${baseName}`" class="legal-page__current-link">
                  Go to current
                </NuxtLink>
              </template>
              <template v-else>
                Last updated on {{ formatDateLong(content.date) }}
              </template>
              <a
                v-if="hasRevisions && !isRevisionPage"
                href="#revisions"
                aria-label="Jump to revisions section"
              >
                (See revisions below)
              </a>
            </p>
          </div>

          <Flex v-if="changeNote || canDiff" y-center gap="xs">
            <Tooltip v-if="changeNote" placement="top">
              <Icon name="ph:note" class="legal-page__note-icon" />
              <template #tooltip>
                <p class="legal-page__note-tooltip">
                  {{ changeNote }}
                </p>
              </template>
            </Tooltip>
            <Button
              v-if="canDiff"
              size="s"
              variant="gray"
              class="legal-page__diff-btn"
              @click="diffOpen = true"
            >
              <template #start>
                <Icon name="ph:git-diff" />
              </template>
              Show changes
            </Button>
          </Flex>
        </Flex>

        <Divider />

        <!-- Callout: this is a future revision, not yet in effect -->
        <Alert v-if="isFutureRevision" variant="warning" class="legal-page__callout">
          This version is not yet in effect. It will replace the
          <NuxtLink :to="`/legal/${baseName}`">
            current version
          </NuxtLink>
          on {{ formatDateLong(content.date) }}.
        </Alert>

        <!-- Callout: current doc has upcoming changes -->
        <Alert v-else-if="!isRevisionPage && futureRevisions.length" variant="info" class="legal-page__callout">
          <template v-if="futureRevisions.length === 1">
            Updated terms will take effect on {{ formatDateLong(futureRevisions[0]) }}.
            <NuxtLink :to="`/legal/${name}/${futureRevisions[0]}`">
              Preview the upcoming version.
            </NuxtLink>
          </template>
          <template v-else>
            Updated terms are scheduled. Upcoming effective dates:
            <span v-for="(r, i) in futureRevisions" :key="r">
              <NuxtLink :to="`/legal/${name}/${r}`">{{ formatDateLong(r) }}</NuxtLink><template v-if="i < futureRevisions.length - 1">, </template>
            </span>.
          </template>
        </Alert>

        <!-- Render the content as Prose & Vue components -->
        <ContentRenderer class="legal-page__content" :value="content" />

        <!-- Seems to not be working right now -->
        <!-- <TableOfContents :toc="content.body.toc" /> -->

        <div v-if="hasRevisions && !isRevisionPage" class="legal-page__revisions">
          <div v-if="futureRevisions.length" class="legal-page__revisions-group">
            <h5 id="revisions">
              Future Revisions
            </h5>
            <p class="legal-page__revisions-note">
              These versions are scheduled to take effect on the listed date.
            </p>
            <ul>
              <li v-for="revision in futureRevisions" :key="revision">
                <NuxtLink
                  :to="`/legal/${name}/${revision}`"
                  :aria-label="`View upcoming revision effective ${formatDateLong(revision)}`"
                >
                  Effective {{ formatDateLong(revision) }}
                </NuxtLink>
              </li>
            </ul>
          </div>

          <div v-if="pastRevisions.length" class="legal-page__revisions-group">
            <h5 :id="futureRevisions.length ? 'past-revisions' : 'revisions'">
              Previous Versions
            </h5>
            <ul>
              <li v-for="revision in pastRevisions" :key="revision">
                <NuxtLink
                  :to="`/legal/${name}/${revision}`"
                  :aria-label="`View revision from ${formatDateLong(revision)}`"
                >
                  {{ formatDateLong(revision) }}
                </NuxtLink>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div v-else class="legal-page__not-found">
        <h1>Document Not Found</h1>
        <p>The requested legal document "{{ name }}" could not be found.</p>
      </div>
    </div>
  </div>

  <LegalDiffView
    v-if="canDiff"
    v-model:open="diffOpen"
    :from-path="diffFromPath || ''"
    :to-path="diffToPath"
    :from-label="diffFromLabel"
    :to-label="diffToLabel"
  />
</template>

<style lang="scss" scoped>
.legal-page {
  &__content {
    padding-top: var(--space-l);
    max-width: var(--container-s);

    :deep(p) {
      color: var(--color-text-light) !important;
    }

    :deep(li),
    :deep(p) {
      a {
        color: var(--color-accent);
        text-decoration: none;

        &:hover {
          text-decoration: underline;
        }
      }
    }
  }

  &__last-updated {
    font-size: var(--font-size-s);
    color: var(--color-text-lighter);
  }

  &__current-link {
    color: var(--color-accent);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  &__note-icon {
    color: var(--color-text-lighter);
    font-size: var(--font-size-m);
    cursor: default;
    transition: color var(--transition-fast);

    &:hover {
      color: var(--color-text-light);
    }
  }

  &__note-tooltip {
    max-width: 28ch;
    font-size: var(--font-size-xs);
    line-height: 1.5;
    margin: 0;
    color: var(--color-text);
  }

  &__diff-btn {
    flex-shrink: 0;
  }

  &__callout {
    margin-top: var(--space-m);

    a {
      color: inherit;
      text-decoration: underline;
    }
  }

  &__revisions {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border);

    li,
    ul,
    ol {
      a {
        color: var(--color-accent);
        text-decoration: none;
        font-size: var(--font-size-s);

        &:hover {
          text-decoration: underline;
        }
      }
    }
  }

  &__revisions-group {
    & + & {
      margin-top: 1rem;
    }
  }

  &__revisions-note {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    margin-bottom: var(--space-xs);
  }

  &__not-found {
    text-align: center;
    padding: 3rem 0;

    h1 {
      margin-bottom: 1rem;
    }

    p {
      color: var(--color-text-lightest);
    }
  }
}
</style>
