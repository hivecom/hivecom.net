<script setup lang="ts">
import { Button, Flex, Tooltip } from '@dolanske/vui'
import { toRefs } from 'vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import NotificationCard from './NotificationCard.vue'

interface Props {
  requestId: string
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
})

const emit = defineEmits<{ (e: 'accept'): void, (e: 'ignore'): void }>()

const { requestId, loading } = toRefs(props)

function handleAccept() {
  emit('accept')
}

function handleIgnore() {
  emit('ignore')
}
</script>

<template>
  <NotificationCard icon="ph:user-plus">
    <Flex class="w-full ml-xxs" x-end>
      <UserDisplay :user-id="requestId" size="s" />
    </Flex>
    <template #actions>
      <Tooltip placement="top">
        <Button
          square
          size="s"
          variant="gray"
          :loading="loading"
          aria-label="Ignore invite"
          @click="handleIgnore"
        >
          <Icon name="ph:x" />
        </Button>
        <template #tooltip>
          <p>Ignore invite</p>
        </template>
      </Tooltip>
      <Tooltip placement="top">
        <Button
          square
          size="s"
          variant="accent"
          :loading="loading"
          aria-label="Accept invite"
          @click="handleAccept"
        >
          <Icon name="ph:check" />
        </Button>
        <template #tooltip>
          <p>Accept invite</p>
        </template>
      </Tooltip>
    </template>
  </NotificationCard>
</template>
