<script setup>
import { Divider } from '@dolanske/vui'
import '@/assets/pages/legal.scss'

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
