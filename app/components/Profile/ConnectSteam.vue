<script setup lang="ts">
import { Button, Tooltip } from '@dolanske/vui'
</script>

<template>
  <div>
    <Tooltip
      placement="top"
    >
      <template #tooltip>
        Steam login coming soon (Valve time)!
      </template>
      <Button
        variant="fill"
        disabled
        aria-disabled="true"
        aria-label="Steam integration coming soon"
      >
        <template #start>
          <Icon name="ph:steam-logo" />
        </template>
        Connect Steam
      </Button>
    </Tooltip>
  </div>
</template>

<style scoped lang="scss">
</style>
