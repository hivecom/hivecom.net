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

// Set page title if content exists
useHead(() => ({
  title: content.value ? `${content.value.title || name} | Legal | Hivecom` : 'Document Not Found | Hivecom',
}))
</script>

<template>
  <div class="legal-page typeset">
    <div v-if="content">
      <h1>{{ content.title || name }}</h1>

      <p class="last-updated">
        Last updated on {{ formatDate(content.date) }}
        <a v-if="content.revisions && content.revisions.length" href="#revisions">
          (See previous revisions below)
        </a>
      </p>

      <Divider />

      <!-- Render the content as Prose & Vue components -->
      <ContentRenderer class="content-wrap" :value="content" />

      <!-- Seems to not be working right now -->
      <!-- <TableOfContents :toc="content.body.toc" /> -->

      <div v-if="content.revisions && content.revisions.length" class="revisions">
        <h5 id="revisions">
          Previous Versions
        </h5>
        <ul>
          <li v-for="revision in content.revisions" :key="revision">
            <NuxtLink :to="`/legal/${name}/${revision}`">
              {{ formatDate(revision) }}
            </NuxtLink>
          </li>
        </ul>
      </div>
    </div>

    <div v-else class="not-found">
      <h1>Document Not Found</h1>
      <p>The requested legal document "{{ name }}" could not be found.</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.legal-page {
  max-width: var(--container-m);
  margin: 0 auto;
  padding: 6.5rem 1rem;

  .content-wrap {
    padding-top: var(--space-l);
  }

  h1 {
    padding-top: 0;
  }

  .revisions {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border);

    li,
    ul,
    ol {
      a {
        color: var(--color-primary);
        text-decoration: none;
        font-size: 0.9rem;

        &:hover {
          text-decoration: underline;
        }
      }
    }
  }

  .last-updated {
    font-size: var(--font-size-s);
  }

  .not-found {
    text-align: center;
    padding: 3rem 0;

    h1 {
      margin-bottom: 1rem;
    }

    p {
      color: var(--color-text-muted);
    }
  }
}
</style>
