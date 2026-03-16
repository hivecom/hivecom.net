<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'

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
    variant="link"
    :small="small"
    style="padding: 0; display: block;"
    @click.stop="navigateToGitHub"
  >
    <template v-if="showIcon" #start>
      <Flex gap="s" y-center>
        <Icon name="ph:github-logo" />
        <template v-if="!hideRepo">
          {{ github }}
        </template>
      </Flex>
    </template>
  </Button>
</template>
