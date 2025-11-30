<script setup lang="ts">
import NotificationCard from './NotificationCard.vue'

const props = withDefaults(defineProps<{ title: string, description?: string | null, to?: string | null }>(), {
  description: null,
  to: '/profile',
})
</script>

<template>
  <NotificationCard :text="props.title" icon="ph:cake" shiny :to="props.to">
    <template v-if="props.description" #meta>
      <p class="notification-card-birthday__description">
        {{ props.description }}
      </p>
    </template>
  </NotificationCard>
</template>

<style scoped>
.notification-card-birthday__description {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}
</style>
