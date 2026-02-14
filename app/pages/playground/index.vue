<script setup lang="ts">
import RichTextEditor from '@/components/Shared/RichTextEditor.vue'

const content = ref(`<p>
          Hey, try to select some text here. There will popup a menu for selecting some inline styles. Remember: you have full control about content and styling of this menu.
        </p>
        <ul>
          <li>Select any item to display a global menu</li>
          <li>Item 1</li>
          <li>Item 2</li>
          <li>Item 3</li>
          <li>Item 4</li>
        </ul>`)
</script>

<template>
  <div style="padding-block: 128px;width:100%">
    <div class="container container-m">
      <RichTextEditor v-model="content" class="mb-xl" placeholder="Yo whats going on big guy?" />
    </div>
  </div>
</template>
