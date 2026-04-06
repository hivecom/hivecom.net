<script setup lang="ts">
import { Alert, Button, Flex } from '@dolanske/vui'

import constants from '~~/constants.json'
import { useBreakpoint } from '@/lib/mediaQuery'

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

const isMobile = useBreakpoint('<s')
</script>

<template>
  <!-- Mobile: custom centered card, no VUI Alert icon fighting layout -->
  <div v-if="isMobile" class="error-alert-mobile">
    <Flex column gap="xs" style="align-items: center; text-align: center;">
      <Icon name="ph:warning-diamond" size="32" class="error-alert-mobile__icon" />
      <p class="error-alert-mobile__message">
        {{ props.message }}
      </p>
      <NuxtLink :to="`mailto:${constants.SUPPORT.EMAIL}`">
        <Button variant="link" size="s">
          <template #start>
            <Icon name="ph:envelope-simple" />
          </template>
          Contact Support
        </Button>
      </NuxtLink>
      <p v-if="props.error" class="text-xs text-color-light">
        {{ props.error }}
      </p>
    </Flex>
  </div>

  <!-- Desktop: original VUI Alert, side-by-side -->
  <Alert v-else variant="danger" filled>
    <Flex y-center x-between gap="s">
      <p>{{ props.message }}</p>
      <NuxtLink :to="`mailto:${constants.SUPPORT.EMAIL}`">
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

<style scoped>
.error-alert-mobile {
  background-color: color-mix(in srgb, var(--color-text-red) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-text-red) 35%, transparent);
  border-radius: var(--border-radius-m);
  padding: var(--space-m) var(--space-l);
  width: 100%;
}

.error-alert-mobile__icon {
  color: var(--color-text-red);
}

.error-alert-mobile__message {
  font-weight: 600;
}
</style>
