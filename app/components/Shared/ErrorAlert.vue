<script setup lang="ts">
import { Alert, Button, Flex } from '@dolanske/vui'

import constants from '~~/constants.json'

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
        :to="`mailto:${constants.SUPPORT.EMAIL}`"
      >
        <Button variant="link" size="s">
          <template #start>
            <Icon name="ph:envelope-simple" />
          </template>
          Contact Support
        </Button>
      </NuxtLink>
    </Flex>
    <p class="text-xs text-left text-color-light">
      {{ props.error }}
    </p>
  </Alert>
</template>
