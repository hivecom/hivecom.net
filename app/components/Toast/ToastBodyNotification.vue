<script setup lang="ts">
import { removeToast } from '@dolanske/vui'
import NotificationCard from '@/components/Notifications/NotificationCard.vue'

interface Props {
  data: {
    icon: string
    title: string
    description?: string | null
    href?: string | null
    source?: string | null
    sourceId?: string | null
    notificationId?: string
    onNavigate?: (notificationId: string) => void
  }
  toastId: number
}

const props = defineProps<Props>()

const router = useRouter()

function handleClick() {
  if (props.data.href == null || props.data.href === '')
    return

  if (props.data.notificationId != null && props.data.onNavigate != null)
    props.data.onNavigate(props.data.notificationId)

  const needsCommentAnchor
    = (props.data.source === 'discussion_reply_reply' || props.data.source === 'mention')
      && props.data.sourceId != null

  const target = needsCommentAnchor
    ? `${props.data.href}?comment=${props.data.sourceId}`
    : props.data.href

  removeToast(props.toastId)
  void router.push(target)
}
</script>

<template>
  <NotificationCard
    :icon="data.icon"
    :text="data.title"
    :description="data.description"
    :clickable="data.href != null && data.href !== ''"
    @click="handleClick"
  />
</template>
