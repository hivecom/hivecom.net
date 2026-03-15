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

const emit = defineEmits<{ (e: 'click'): void }>()
</script>

<template>
  <NotificationCard
    icon="ph:chat-circle"
    clickable
    :text="props.title"
    :description="props.body"
    @click="emit('click')"
  />
</template>
