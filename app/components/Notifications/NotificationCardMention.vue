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
    icon="ph:at"
    highlight
    class="notification-card-mention--clickable"
  >
    <div class="notification-card-mention__content">
      <p class="notification-card-mention__title">
        {{ props.title }}
      </p>
      <p v-if="props.body" class="notification-card-mention__body">
        {{ props.body }}
      </p>
    </div>
  </NotificationCard>
</template>

<style scoped lang="scss">
.notification-card-mention--clickable {
  cursor: pointer;
}

.notification-card-mention__content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-left: var(--space-s);
  min-width: 0;
}

.notification-card-mention__title {
  margin: 0;
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-semibold);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notification-card-mention__body {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-lighter);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
