<script setup lang="ts">
import { Button, Flex, Modal, pushToast } from '@dolanske/vui'
import SharedErrorToast from '@/components/Shared/ErrorToast.vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'enabled'): void
}>()

const supabase = useSupabaseClient()
const userId = useUserId()
const loading = ref(false)

function showErrorToast(message: string) {
  pushToast('', {
    body: SharedErrorToast,
    bodyProps: { error: message },
  })
}

async function enableRichPresence() {
  loading.value = true
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ rich_presence_enabled: true })
      .eq('id', userId.value)

    if (error)
      throw error

    pushToast('Rich presence enabled.')
    emit('enabled')
    emit('close')
  }
  catch (error) {
    showErrorToast(error instanceof Error ? error.message : 'Unable to enable rich presence.')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <Modal :open="props.open" centered :card="{ separators: true }" size="s" @close="emit('close')">
    <template #header>
      <Flex y-center gap="s">
        <div class="presence-icon">
          <Icon name="ph:activity" size="20" />
        </div>
        <h4>Enable Rich Presence?</h4>
      </Flex>
    </template>

    <Flex column gap="m">
      <p>
        You've connected a service that supports rich presence, but rich presence is currently disabled.
        Enable it to let Hivecom fetch and display your activity from connected services.
      </p>
    </Flex>

    <template #footer>
      <Flex gap="s" x-end>
        <Button variant="gray" :disabled="loading" @click="emit('close')">
          Not now
        </Button>
        <Button variant="accent" :loading="loading" @click="enableRichPresence">
          Enable
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style scoped lang="scss">
.presence-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--border-radius-m);
  background: var(--color-accent);
  flex-shrink: 0;

  .iconify {
    color: var(--color-text-invert);
  }
}
</style>
