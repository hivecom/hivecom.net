<script setup lang="ts">
import RichTextEditor from '@/components/Shared/RichTextEditor.vue'

const content = ref('')
</script>

<template>
  <div style="padding-block: 128px;width:100%">
    <div class="container container-m">
      <RichTextEditor v-model="content" class="mb-xl" placeholder="Yo whats going on big guy?" />

      <pre>{{ content }}</pre>
    </div>
  </div>
</template>
