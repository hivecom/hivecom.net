<script setup lang="ts">
import { Button } from '@dolanske/vui'

const props = defineProps<{
  github: string | null
  showIcon?: boolean
  hideRepo?: boolean
  small?: boolean
}>()

// Format the GitHub URL if a github repo exists
const githubUrl = computed(() => {
  if (!props.github)
    return null
  return `https://github.com/${props.github}`
})

// Navigate to GitHub repository page
function navigateToGitHub() {
  if (githubUrl.value) {
    window.open(githubUrl.value, '_blank', 'noopener,noreferrer')
  }
}
</script>

<template>
  <span v-if="!github">-</span>
  <Button
    v-else
    :expand="false"
    variant="link"
    :small="small"
    style="padding: 0; display: block;"
    @click.stop="navigateToGitHub"
  >
    <template v-if="showIcon" #start>
      <Icon name="ph:github-logo" />
    </template>
    <template v-if="!hideRepo">
      {{ github }}
    </template>
  </Button>
</template>
