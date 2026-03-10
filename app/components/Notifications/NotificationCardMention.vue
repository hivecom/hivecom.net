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
    :text="props.title"
    :description="props.body"
  />
</template>
