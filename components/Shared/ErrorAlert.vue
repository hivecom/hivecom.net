<script setup lang="ts">
import constants from '@/constants.json'

import { Alert, Button, Flex } from '@dolanske/vui'

const props = defineProps({
  message: {
    type: String,
    default: '',
  },
  error: {
    type: String,
    default: '',
  },
})
</script>

<template>
  <Alert
    variant="danger" filled
  >
    <Flex y-center x-between>
      <p>{{ props.message }}</p>
      <NuxtLink
        :to="`mailto:${constants.EMAIL.SUPPORT}`"
      >
        <Button variant="link" size="s">
          <template #start>
            <Icon name="ph:envelope-simple" />
          </template>
          Contact Support
        </Button>
      </NuxtLink>
    </Flex>
    <p class="error-message">
      {{ props.error }}
    </p>
  </Alert>
</template>

<style scoped lang="scss">
.error-message {
  font-size: var(--font-size-xs);
  color: var(--color-text-light);
}
</style>
