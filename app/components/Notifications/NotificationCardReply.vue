<script setup lang="ts">
import NotificationCard from './NotificationCard.vue'

interface Props {
  title: string
  body?: string | null
  href?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  body: null,
  href: null,
})
</script>

<template>
  <NotificationCard
    icon="ph:chat-circle"
    highlight
    class="notification-card-reply--clickable"
  >
    <div class="notification-card-reply__content">
      <p class="notification-card-reply__title">
        {{ props.title }}
      </p>
      <p v-if="props.body" class="notification-card-reply__body">
        {{ props.body }}
      </p>
    </div>
  </NotificationCard>
</template>

<style scoped lang="scss">
.notification-card-reply--clickable {
  cursor: pointer;
}

.notification-card-reply__content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-left: var(--space-s);
  min-width: 0;
}

.notification-card-reply__title {
  margin: 0;
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-semibold);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notification-card-reply__body {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-lighter);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
