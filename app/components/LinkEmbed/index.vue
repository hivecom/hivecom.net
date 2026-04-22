<script setup lang="ts">
import { Flex, Spinner } from '@dolanske/vui'
import { useDataLinkPreview } from '@/composables/useDataLinkPreview'
import LinkEmbedEvent from './LinkEmbedEvent.vue'
import LinkEmbedGameServer from './LinkEmbedGameServer.vue'
import LinkEmbedProfile from './LinkEmbedProfile.vue'
import LinkEmbedReferendum from './LinkEmbedReferendum.vue'
import LinkEmbedThread from './LinkEmbedThread.vue'
import LinkEmbedUrl from './LinkEmbedUrl.vue'

const props = defineProps<{
  url: string
  mentionLookup?: Record<string, string>
}>()

const { data, loading } = useDataLinkPreview(props.url)
</script>

<template>
  <div class="link-embed-wrapper">
    <div v-if="loading" class="link-embed link-embed--loading">
      <Flex y-center gap="s">
        <Spinner size="s" />
        <span class="link-embed__loading-text">Loading preview...</span>
      </Flex>
    </div>

    <template v-else-if="data">
      <LinkEmbedThread
        v-if="data.type === 'forum-discussion'"
        :data="data"
        :mention-lookup="mentionLookup ?? {}"
      />
      <LinkEmbedProfile
        v-else-if="data.type === 'profile'"
        :data="data"
      />
      <LinkEmbedGameServer
        v-else-if="data.type === 'gameserver'"
        :data="data"
      />
      <LinkEmbedEvent
        v-else-if="data.type === 'event'"
        :data="data"
      />
      <LinkEmbedReferendum
        v-else-if="data.type === 'vote'"
        :data="data"
      />
      <LinkEmbedUrl
        v-else-if="data.type === 'unknown'"
        :data="data"
      />
    </template>
  </div>
</template>

<style lang="scss">
.link-embed-wrapper {
  margin: var(--space-xs) 0;
}

.link-embed {
  display: block;
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-accent);
  border-radius: var(--border-radius-s);
  background-color: var(--color-bg-raised);
  padding: var(--space-s) var(--space-m);
  text-decoration: none;
  color: inherit;
  transition:
    background-color var(--transition),
    border-color var(--transition);
  overflow: hidden;
  position: relative;

  &:hover {
    background-color: var(--color-bg-medium);
    border-color: var(--color-border-strong);
    border-left-color: var(--color-accent);
  }

  &--loading {
    padding: var(--space-xs) var(--space-m);
    cursor: default;

    &:hover {
      background-color: var(--color-bg-raised);
    }
  }

  &--gameserver {
    padding: 0;

    .link-embed__body:not(.link-embed__body--over-bg) {
      padding: var(--space-s) var(--space-m);
    }
  }
}

.link-embed__loading-text {
  font-size: var(--font-size-xs);
  color: var(--color-text-lighter);
}

.link-embed__body {
  width: 100%;
  min-width: 0;

  &--profile {
    display: flex;
    align-items: center;
    gap: var(--space-m);
  }

  &--column {
    align-items: stretch;
  }

  &--over-bg {
    position: relative;
    z-index: 1;
    padding: var(--space-s) var(--space-m);
  }
}

.link-embed__header {
  flex-wrap: wrap;
}

.link-embed__eyebrow {
  font-size: var(--font-size-xs);
  color: var(--color-text-lighter);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;

  &--sep {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }
}

.link-embed__icon {
  color: var(--color-accent);
  font-size: 1rem;
  flex-shrink: 0;
}

.link-embed__title {
  font-size: var(--font-size-s);
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.link-embed__description {
  font-size: var(--font-size-xs);
  color: var(--color-text-light);
  margin: 0 !important;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-clamp: 2;
  overflow: hidden;

  &--empty {
    color: var(--color-text-lighter);
    font-style: italic;
    display: block;
  }
}

.link-embed__meta {
  flex-wrap: wrap;
}

.link-embed__meta-item {
  font-size: var(--font-size-xs);
  color: var(--color-text-lighter);

  &--muted {
    color: var(--color-text-lighter);
  }

  &--countdown {
    color: var(--color-accent);
    font-weight: 600;
  }
}

.link-embed__meta-sep {
  font-size: var(--font-size-xs);
  color: var(--color-text-lighter);
}

.link-embed__avatar {
  flex-shrink: 0;
}
</style>
