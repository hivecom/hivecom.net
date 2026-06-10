<script setup lang="ts">
import { Button, Flex, Modal } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

defineProps<{ blocked: { channel: string, reason: string } | null }>()
const emit = defineEmits<{ close: [] }>()

const isMobile = useBreakpoint('<s')
</script>

<template>
  <Modal :open="blocked !== null" :size="isMobile ? 'screen' : 's'" @close="emit('close')">
    <template #header>
      <h4>Cannot join {{ blocked?.channel }}</h4>
    </template>

    <p class="text-s channel-join-blocked__reason">
      {{ blocked?.reason }}
    </p>

    <template #footer>
      <Flex x-end>
        <Button variant="accent" @click="emit('close')">
          OK
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style lang="scss" scoped>
.channel-join-blocked {
  &__reason {
    color: var(--color-text-light);
    margin: 0;
  }
}
</style>
