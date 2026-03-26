<script setup lang="ts">
import type { Component } from 'vue'
import { Button, Flex, pushToast, removeToast } from '@dolanske/vui'
import ToastBodyFriendRequest from '@/components/Toast/ToastBodyFriendRequest.vue'
import ToastBodyNotification from '@/components/Toast/ToastBodyNotification.vue'

const userId = useUserId()

function fireNotificationToast(source: string, icon: string, title: string) {
  pushToast('', {
    body: ToastBodyNotification as Component,
    bodyProps: {
      icon,
      title,
      description: 'This is a test notification body',
      href: '/forum',
    },
  })
}

function fireFriendRequestToast() {
  pushToast('', {
    persist: true,
    body: ToastBodyFriendRequest as Component,
    bodyProps: {
      requesterId: userId.value ?? 'test-id',
      onAccept: (toastId: number) => {
        removeToast(toastId)
        pushToast('Friend request accepted')
      },
      onDecline: (toastId: number) => {
        removeToast(toastId)
      },
    },
  })
}
</script>

<template>
  <div style="padding-block: 128px; width: 100%">
    <div class="container container-m">
      <Flex column gap="l" x-center>
        <Flex column gap="xs" x-center>
          <h3>Notification toasts</h3>
          <Flex gap="s" wrap x-center>
            <Button variant="accent" @click="fireNotificationToast('discussion_reply', 'ph:chat-circle-dots', 'New discussion reply')">
              Discussion reply
            </Button>
            <Button variant="accent" @click="fireNotificationToast('discussion_reply_reply', 'ph:chat-circle', 'New reply to your comment')">
              Reply to comment
            </Button>
            <Button variant="accent" @click="fireNotificationToast('mention', 'ph:at', 'You were mentioned')">
              Mention
            </Button>
          </Flex>
        </Flex>
        <Flex column gap="xs" x-center>
          <h3>Friend request toast</h3>
          <Button variant="accent" @click="fireFriendRequestToast">
            Friend request
          </Button>
        </Flex>
      </Flex>
    </div>
  </div>
</template>
