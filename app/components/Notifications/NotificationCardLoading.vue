<script setup lang="ts">
import { Flex, Spinner } from '@dolanske/vui'
import NotificationCard from './NotificationCard.vue'

const props = withDefaults(defineProps<{ text?: string }>(), {
  text: 'Loading updates',
})
</script>

<template>
  <NotificationCard :text="props.text" icon="ph:bell">
    <Flex gap="s" y-center class="notification-card-loading__spinner">
      <Spinner size="s" />
    </Flex>
  </NotificationCard>
</template>

<style scoped>
.notification-card-loading__spinner {
  margin-right: var(--space-m);
}
</style>
