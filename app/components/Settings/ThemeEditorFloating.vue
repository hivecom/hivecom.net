<script setup lang="ts">
import ThemeEditorControls from './ThemeEditorControls.vue'

// TODO:
// Floating editor is not absolute, but a sidebar to the entire application
</script>

<template>
  <div class="theme-editor-floating">
    <ThemeEditorControls />
  </div>
</template>

<style lang="scss" scoped>
.theme-editor-floating {
  /* position: absolute;
  right: 64px;
  bottom: 64px; */
}
</style>
