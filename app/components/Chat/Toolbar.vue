<script setup lang="ts">
import { Button, Flex, Tooltip } from '@dolanske/vui'
import ChatMenubar from './Menubar.vue'
import ChatStateBadge from './StateBadge.vue'

defineProps<{
  // Shows the "expand to full page" link (used inside the navbar sheet).
  expandable?: boolean
}>()

const emit = defineEmits<{ collapse: [] }>()
</script>

<template>
  <Flex y-center x-between expand gap="s" class="chat-toolbar">
    <ChatMenubar />
    <Flex y-center gap="s">
      <ChatStateBadge />
      <Tooltip v-if="expandable">
        <NuxtLink to="/chat" @click="emit('collapse')">
          <Button square plain aria-label="Expand chat" class="vui-button-accent-weak vui-button-rounded">
            <Icon name="ph:arrows-out" size="18" />
          </Button>
        </NuxtLink>
        <template #tooltip>
          <p>Open full chat</p>
        </template>
      </Tooltip>
    </Flex>
  </Flex>
</template>
