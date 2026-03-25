<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Modal } from '@dolanske/vui'
import ThemeEditorControls from './ThemeEditorControls.vue'
import ThemeSampleUI from './ThemeSampleUI.vue'

interface Props {
  open: boolean
  editing?: Tables<'themes'> | null
}

const { open, editing } = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <Modal size="screen" :open class="theme-editor" hide-close-button @close="emit('close')">
    <div class="theme-editor__layout">
      <div class="container container-s">
        <ThemeSampleUI />
      </div>

      <ThemeEditorControls
        v-if="open"
        :editing
        @close="emit('close')"
        @saved="emit('close')"
      />
    </div>
  </Modal>
</template>

<style lang="scss">
@use '@/assets/breakpoints.scss' as *;

.theme-editor {
  &__layout {
    display: grid;
    grid-template-columns: 1fr 420px;

    .container {
      padding-top: var(--space-xxxl);
      padding-bottom: var(--space-l);
    }
  }

  /* For the love of me I can't scope it to the modal card */
  .vui-card .vui-card-content {
    padding: 0;
  }

  .example-card {
    display: block;
    width: 100%;
    text-align: center;

    padding: var(--space-l);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-m);
    color: var(--color-text-light);

    &.weak {
      border-color: var(--color-border-weak);
      color: var(--color-text-lighter);
    }

    &.strong {
      border-color: var(--color-border-strong);
      color: var(--color-text);
    }

    &.lowered {
      background-color: var(--color-bg-lowered);
    }

    &.raised {
      background-color: var(--color-bg-raised);
    }

    &.medium {
      background-color: var(--color-bg-medium);
    }
  }
}

@media screen and (max-width: $breakpoint-s) {
  .theme-editor {
    &__layout {
      display: block;
    }
  }
}
</style>
