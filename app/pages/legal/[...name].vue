<script setup lang="ts">
import { Alert, Button, Divider, Flex, Tooltip } from '@dolanske/vui'
import LegalDiffView from '@/components/Legal/DiffView.vue'
import { calendarDateLong, formatDateOnly } from '@/lib/utils/date'

const route = useRoute()
const name = computed(() => (route.params.name as string[]).filter(Boolean).join('/'))

const { data: content, error: contentError } = await useAsyncData(
  () => `legal:${name.value}`,
  () => queryCollection('legal').path(`/legal/${name.value}`).first(),
  { watch: [name] },
)

const seoTitle = computed(() =>
  content.value ? `${content.value.title || name.value} | Legal` : 'Document Not Found',
)
const seoDescription = computed(() => content.value?.description || 'Hivecom legal documentation.')

useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  ogTitle: seoTitle,
  ogDescription: seoDescription,
})

defineOgImage('Default', {
  title: computed(() => seoTitle.value),
  description: computed(() => seoDescription.value),
})

// Effective dates are date-only YYYY-MM-DD strings, so revisions are compared
// lexicographically against the viewer's local day instead of Date objects,
// which would shift across the UTC boundary.
const todayKey = formatDateOnly(new Date())

// Detect whether we're viewing a revision (path has 2+ segments, e.g. "terms/2026-12-01")
const nameParts = computed(() => name.value.split('/'))
const isRevisionPage = computed(() => nameParts.value.length > 1)

// The base document name (e.g. "terms") for linking back
const baseName = computed(() => nameParts.value[0])

// The current in-effect document. On the index page this is the same document
// as `content`, but fetching it unconditionally keeps the cached entry a real
// document, so client-side navigation between the index and a revision page
// never gets stuck on a cached null.
const { data: parentContent, error: parentError } = await useAsyncData(
  () => `legal:${baseName.value}:parent`,
  () => queryCollection('legal').path(`/legal/${baseName.value}`).first(),
  { watch: [name] },
)

// For revision pages: is this document not yet in effect?
const isFutureRevision = computed(() => {
  if (!isRevisionPage.value || !content.value?.date)
    return false
  return content.value.date >= todayKey
})

// Past revision = is a revision page, not future
const isPastRevision = computed(() => isRevisionPage.value && !isFutureRevision.value)

// Effective date of the current in-effect version, shown as its own entry on
// revision pages.
const currentDate = computed(() => parentContent.value?.date ?? null)

// The lists leave out the date of the page being viewed and the current
// version's date, so no page links to itself and the current version only
// appears as the dedicated "Current Version" entry.
const pastRevisions = computed(() =>
  (parentContent.value?.revisions ?? []).filter(r =>
    r < todayKey && r !== content.value?.date && r !== currentDate.value,
  ),
)

const futureRevisions = computed(() =>
  (parentContent.value?.revisions ?? []).filter(r =>
    r >= todayKey && r !== content.value?.date,
  ),
)

const hasRevisions = computed(() =>
  pastRevisions.value.length > 0
  || futureRevisions.value.length > 0
  || (isRevisionPage.value && !!currentDate.value),
)

// Diff toggle
const diffOpen = ref(false)

// On the current page: compare most recent past revision -> current.
// On a revision page: compare the revision immediately before this one -> this one.
// If this is the oldest revision, nothing before it to diff against.
const diffFromPath = computed(() => {
  if (!isRevisionPage.value) {
    const last = pastRevisions.value.at(-1)
    return last ? `/legal/${baseName.value}/${last}` : null
  }

  const thisDate = content.value?.date
  if (!thisDate)
    return null

  const all = (parentContent.value?.revisions ?? []).toSorted((a, b) => new Date(a).getTime() - new Date(b).getTime())

  const idx = all.indexOf(thisDate)
  return idx > 0 ? `/legal/${baseName.value}/${all[idx - 1]}` : null
})

const diffToPath = computed(() => `/legal/${name.value}`)

const diffFromLabel = computed(() => {
  if (!isRevisionPage.value) {
    const last = pastRevisions.value.at(-1)
    return last ? calendarDateLong(last) : ''
  }

  const thisDate = content.value?.date
  if (!thisDate)
    return ''

  const all = (parentContent.value?.revisions ?? []).toSorted((a, b) => new Date(a).getTime() - new Date(b).getTime())

  const idx = all.indexOf(thisDate)
  return idx > 0 ? calendarDateLong(all[idx - 1]) : ''
})

const diffToLabel = computed(() => calendarDateLong(content.value?.date ?? null))

const canDiff = computed(() => !!diffFromPath.value)

// The note always lives on the "to" document (the newer version being diffed into).
// On the current page and revision pages alike, that's content.value.
const changeNote = computed(() => content.value?.notes ?? null)

// True when a DB-level error occurred (e.g. cold-start SQLite race in dev).
// We don't want to show "Document Not Found" for transient infra failures.
const hasError = computed(() => !!(contentError.value ?? parentError.value))
</script>

<template>
  <div>
    <div class="container-m">
      <div class="page legal-page typeset">
        <div v-if="hasError" class="legal-page__not-found">
          <h1>Something Went Wrong</h1>
          <p>The document could not be loaded. Please try refreshing the page.</p>
        </div>
        <div v-else-if="content">
          <h1>{{ content.title || name }}</h1>

          <Flex x-between y-center gap="m" wrap>
            <div>
              <p class="legal-page__last-updated">
                <template v-if="isFutureRevision">
                  Effective on {{ calendarDateLong(content.date) }}
                </template>
                <template v-else-if="isPastRevision">
                  Previously effective from {{ calendarDateLong(content.date) }} -
                  <NuxtLink :to="`/legal/${baseName}`" class="legal-page__current-link">
                    Go to current
                  </NuxtLink>
                </template>
                <template v-else>
                  Effective since {{ calendarDateLong(content.date) }}
                </template>
              </p>
            </div>

            <Flex v-if="changeNote || canDiff || hasRevisions" y-center gap="xs">
              <Tooltip v-if="changeNote" placement="top">
                <Icon name="ph:note" class="legal-page__note-icon" />
                <template #tooltip>
                  <div class="typeset">
                    <ul>
                      <li v-for="(note, i) in changeNote" :key="i">
                        <p>
                          {{ note }}
                        </p>
                      </li>
                    </ul>
                  </div>
                </template>
              </Tooltip>
              <Button
                v-if="hasRevisions"
                size="s"
                variant="gray"
                href="#revisions"
                tag="a"
              >
                <template #start>
                  <Icon name="ph:clock-counter-clockwise" />
                </template>
                Revisions
              </Button>
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
                Changes from last Revision
              </Button>
            </Flex>
          </Flex>

          <Divider class="my-m" />

          <!-- Callout: this is a future revision, not yet in effect -->
          <Alert v-if="isFutureRevision" variant="warning" class="legal-page__callout">
            This version is not yet in effect. It will replace the
            <NuxtLink :to="`/legal/${baseName}`">
              current version
            </NuxtLink>
            on {{ calendarDateLong(content.date) }}.
          </Alert>

          <!-- Callout: current doc has upcoming changes -->
          <Alert v-else-if="!isRevisionPage && futureRevisions.length" variant="info" class="legal-page__callout">
            <template v-if="futureRevisions.length === 1">
              Updated terms will take effect on {{ calendarDateLong(futureRevisions[0]) }}.
              <NuxtLink :to="`/legal/${name}/${futureRevisions[0]}`">
                Preview the upcoming version.
              </NuxtLink>
            </template>
            <template v-else>
              Updated terms are scheduled. Upcoming effective dates:
              <span v-for="(r, i) in futureRevisions" :key="r">
                <NuxtLink :to="`/legal/${name}/${r}`">{{ calendarDateLong(r) }}</NuxtLink><template v-if="i < futureRevisions.length - 1">, </template>
              </span>.
            </template>
          </Alert>

          <!-- Render the content as Prose & Vue components -->
          <ContentRenderer class="legal-page__content" :value="content" />

          <!-- Seems to not be working right now -->
          <!-- <TableOfContents :toc="content.body.toc" /> -->

          <div v-if="hasRevisions" id="revisions" class="legal-page__revisions">
            <div v-if="futureRevisions.length" class="legal-page__revisions-group">
              <h5>Future Revisions</h5>
              <p class="legal-page__revisions-note">
                These versions are scheduled to take effect on the listed date.
              </p>
              <ul>
                <li v-for="revision in futureRevisions" :key="revision">
                  <NuxtLink
                    :to="`/legal/${baseName}/${revision}`"
                    :aria-label="`View upcoming revision effective ${calendarDateLong(revision)}`"
                  >
                    Effective {{ calendarDateLong(revision) }}
                  </NuxtLink>
                </li>
              </ul>
            </div>

            <div v-if="isRevisionPage && currentDate" class="legal-page__revisions-group">
              <h5>Current Version</h5>
              <ul>
                <li>
                  <NuxtLink
                    :to="`/legal/${baseName}`"
                    :aria-label="`View current version effective since ${calendarDateLong(currentDate)}`"
                  >
                    Effective since {{ calendarDateLong(currentDate) }}
                  </NuxtLink>
                </li>
              </ul>
            </div>

            <div v-if="pastRevisions.length" class="legal-page__revisions-group">
              <h5>Previous Revisions</h5>
              <ul>
                <li v-for="revision in pastRevisions" :key="revision">
                  <NuxtLink
                    :to="`/legal/${baseName}/${revision}`"
                    :aria-label="`View revision from ${calendarDateLong(revision)}`"
                  >
                    {{ calendarDateLong(revision) }}
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
  </div>
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
