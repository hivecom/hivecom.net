<script setup lang="ts">
import RichTextEditor from '@/components/Editor/RichTextEditor.vue'
import MarkdownRenderer from '@/components/Shared/MarkdownRenderer.vue'

const editorContent = ref('')

definePageMeta({ layout: 'default' })

const sampleMd = `Here is a plain discussion link:

http://localhost:3000/forum/looking-for-people-to-play-cs2-with

And the same discussion but linking to a specific reply:

http://localhost:3000/forum/looking-for-people-to-play-cs2-with?comment=018d224c-0e49-4b6d-b57a-87299605c2b5

And here is a profile link (public):

http://localhost:3000/profile/Hivecom

Profile link (private):

http://localhost:3000/profile/TestUser

And a game server link:

http://localhost:3000/servers/gameservers/1

An event link:

http://localhost:3000/events/1

And a community vote link:

http://localhost:3000/votes/1

A multi-choice ongoing vote:

http://localhost:3000/votes/3

A concluded vote:

http://localhost:3000/votes/4

Links that appear **inline** like [this one](http://localhost:3000/forum/looking-for-people-to-play-cs2-with) should stay as regular links and not get embedded.
`
</script>

<template>
  <div class="playground-page">
    <div class="container-m">
      <h2>Link Embed Prototype</h2>
      <p class="playground-page__desc">
        Standalone internal links in markdown are enriched into contextual embed cards.
        Inline links stay as plain text links.
      </p>
      <div class="playground-page__demo">
        <MarkdownRenderer :md="sampleMd" :skeleton-height="0" />
      </div>

      <h2 class="playground-page__section-title">
        Editor
      </h2>
      <p class="playground-page__desc">
        Paste or type an internal link on its own line to see it convert to an embed node.
      </p>
      <div class="playground-page__demo">
        <RichTextEditor v-model="editorContent" placeholder="Type or paste a link..." />
        <template v-if="editorContent">
          <p class="playground-page__preview-label">
            Rendered output:
          </p>
          <MarkdownRenderer :md="editorContent" :skeleton-height="0" />
        </template>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.playground-page {
  padding-block: 128px;
  width: 100%;

  h2 {
    margin-bottom: var(--space-s);
  }
}

.playground-page__section-title {
  margin-top: var(--space-xl);
  margin-bottom: var(--space-s);
}

.playground-page__desc {
  color: var(--color-text-light);
  font-size: var(--font-size-s);
  margin-bottom: var(--space-l);
}

.playground-page__preview-label {
  font-size: var(--font-size-xs);
  color: var(--color-text-lighter);
  margin: var(--space-m) 0 var(--space-s);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}

.playground-page__demo {
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  background-color: var(--color-bg-raised);
  padding: var(--space-l);
}
</style>
