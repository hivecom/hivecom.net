<script setup lang="ts">
import { Button, Tooltip } from '@dolanske/vui'
import NotificationCard from './NotificationCard.vue'

interface Props {
  title: string
  href?: string | null
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  href: null,
  loading: false,
})

const emit = defineEmits<{ (e: 'unsubscribe'): void, (e: 'click'): void }>()
</script>

<template>
  <NotificationCard
    icon="ph:bell-ringing"
    :text="props.title"
    :to="props.href"
    @click="emit('click')"
  >
    <template #actions>
      <Tooltip placement="left">
        <Button
          square
          size="s"
          variant="gray"
          aria-label="Unsubscribe"
          :loading="props.loading"
          @click.stop="emit('unsubscribe')"
        >
          <Icon name="ph:bell-slash" />
        </Button>
        <template #tooltip>
          <p>Unsubscribe</p>
        </template>
      </Tooltip>
    </template>
  </NotificationCard>
</template>
