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
  standalone: {
    type: Boolean,
    default: false,
  },
})

const isMobile = useBreakpoint('<s')
</script>

<template>
  <!-- Standalone: centered layout for use inside cards/page sections -->
  <div v-if="props.standalone" class="error-alert-standalone">
    <Alert variant="danger" filled>
      <Flex column gap="s" x-center y-center>
        <Icon name="ph:warning-diamond" size="48" class="standalone-icon" />
        <p class="standalone-message">
          {{ props.message }}
        </p>
        <p v-if="props.error" class="text-s text-color-red py-m">
          {{ props.error }}
        </p>
        <NuxtLink :to="`mailto:${constants.SUPPORT.EMAIL}`">
          <Button variant="link" size="s">
            <template #start>
              <Icon name="ph:envelope-simple" />
            </template>
            Contact Support
          </Button>
        </NuxtLink>
      </Flex>
    </Alert>
  </div>

  <!-- Mobile: stacked centered layout -->
  <Alert v-else-if="isMobile" variant="danger" filled>
    <Flex column gap="xs" x-center>
      <Icon name="ph:warning-diamond" size="32" class="standalone-icon" />
      <p class="standalone-message">
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
  </Alert>

  <!-- Desktop: side-by-side -->
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
.error-alert-standalone {
  width: 100%;
  :deep(.vui-alert-icon) {
    display: none;
  }
}

.standalone-icon {
  color: var(--color-text-red);
}

.standalone-message {
  font-weight: 600;
  text-align: center;
}
</style>
