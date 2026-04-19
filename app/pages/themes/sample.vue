<script setup lang="ts">
import ThemeSampleUI from '@/components/Themes/ThemeSampleUI.vue'

// TODO: add some description about theme editing and how user can navigate out etc
const { editorActive } = useThemeEditorState()
const router = useRouter()

watch(editorActive, (isActive) => {
  if (!isActive) {
    router.replace('/themes')
  }
}, {
  immediate: true,
})
</script>

<template>
  <div class="page">
    <div class="container container-s">
      <ThemeSampleUI />
    </div>
  </div>
</template>
