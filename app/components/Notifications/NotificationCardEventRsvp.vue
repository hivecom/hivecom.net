<script setup lang="ts">
import NotificationCard from './NotificationCard.vue'

interface Props {
  title: string
  body?: string | null
  href?: string | null
  timestamp?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  body: null,
  href: null,
  timestamp: null,
})

const emit = defineEmits<{ (e: 'click'): void }>()
</script>

<template>
  <NotificationCard
    icon="ph:calendar-x"
    clickable
    :text="props.title"
    :description="props.body"
    :timestamp="props.timestamp"
    @click="emit('click')"
  />
</template>
