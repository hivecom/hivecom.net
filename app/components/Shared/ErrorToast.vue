<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import constants from '~~/constants.json'

defineProps({
  data: {
    type: Object,
    required: true,
  },
  toastId: {
    type: Number,
    required: true,
  },
})
</script>

<template>
  <Flex column gap="xs">
    <Flex y-center gap="s" style="margin-top: -8px">
      <Icon name="ph:warning-octagon" size="24" />
      <h5>Error</h5>
    </Flex>
    <p class="text">
      {{ data.error }}
    </p>
    <p class="contact">
      {{ constants.UI_ERROR }}
    </p>
  </Flex>
</template>

<style scoped lang="scss">
p {
  margin: 0;
}

.text {
  color: var(--text-color) !important;
}

.contact {
  font-size: 1rem !important;
}
</style>
