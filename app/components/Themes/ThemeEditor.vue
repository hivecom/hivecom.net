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
  saved: []
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
        @saved="emit('saved'); emit('close')"
      />
    </div>
  </Modal>
</template>

<style lang="scss">
@use '@/assets/breakpoints.scss' as *;

.theme-editor {
  &__layout {
    display: grid;
    grid-template-columns: 1fr 456px;

    .container {
      padding-top: var(--space-xxxl);
      padding-bottom: var(--space-l);
    }
  }

  /* For the love of me I can't scope it to the modal card */
  .vui-card .vui-card-content {
    padding: 0;
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
