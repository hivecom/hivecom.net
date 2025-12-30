<script setup>
import { Divider } from '@dolanske/vui'

const name = useRoute().params.name.join('/')

const { data: content } = await useAsyncData(name, async () => {
  return await queryCollection('legal').path(`/legal/${name}`).first()
})

// Format dates nicely
function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

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
</script>

<template>
  <div class="page legal-page typeset">
    <div v-if="content">
      <h1>{{ content.title || name }}</h1>

      <p class="legal-page__last-updated">
        Last updated on {{ formatDate(content.date) }}
        <a
          v-if="content.revisions && content.revisions.length"
          href="#revisions"
          aria-label="Jump to previous revisions section"
        >
          (See previous revisions below)
        </a>
      </p>

      <Divider />

      <!-- Render the content as Prose & Vue components -->
      <ContentRenderer class="legal-page__content" :value="content" />

      <!-- Seems to not be working right now -->
      <!-- <TableOfContents :toc="content.body.toc" /> -->

      <div v-if="content.revisions && content.revisions.length" class="legal-page__revisions">
        <h5 id="revisions">
          Previous Versions
        </h5>
        <ul>
          <li v-for="revision in content.revisions" :key="revision">
            <NuxtLink
              :to="`/legal/${name}/${revision}`"
              :aria-label="`View revision from ${formatDate(revision)}`"
            >
              {{ formatDate(revision) }}
            </NuxtLink>
          </li>
        </ul>
      </div>
    </div>

    <div v-else class="legal-page__not-found">
      <h1>Document Not Found</h1>
      <p>The requested legal document "{{ name }}" could not be found.</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.legal-page {
  max-width: var(--container-m);

  &__content {
    padding-top: var(--space-l);
  }

  &__last-updated {
    font-size: var(--font-size-s);
  }

  &__revisions {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border);

    li,
    ul,
    ol {
      a {
        color: var(--color-primary);
        text-decoration: none;
        font-size: var(--font-size-s);

        &:hover {
          text-decoration: underline;
        }
      }
    }
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
