<script setup lang="ts">
import NotificationCardInvite from '@/components/Notifications/NotificationCardInvite.vue'

interface Props {
  data: {
    requesterId: string
    onAccept: (toastId: number) => void
    onDecline: (toastId: number) => void
  }
  toastId: number
}

const props = defineProps<Props>()
</script>

<template>
  <NotificationCardInvite
    :request-id="data.requesterId"
    @accept="data.onAccept(props.toastId)"
    @ignore="data.onDecline(props.toastId)"
  />
</template>
