<script setup lang="ts">
import { Button } from '@dolanske/vui'
</script>

<template>
  <div>
    <Button
      variant="fill"
      disabled
      aria-disabled="true"
      aria-label="Steam integration coming soon"
    >
      <template #start>
        <Icon name="ph:steam-logo" />
      </template>
      Connect Steam (Coming Soon)
    </Button>
  </div>
</template>

<style scoped lang="scss">
</style>
