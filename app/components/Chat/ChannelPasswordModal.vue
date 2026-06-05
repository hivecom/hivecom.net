<script setup lang="ts">
import { Button, Flex, Input, Modal } from '@dolanske/vui'
import { ref, watch } from 'vue'
import { useIrcChat } from '@/composables/useIrcChat'

const props = defineProps<{ channel: string | null }>()
const emit = defineEmits<{ close: [] }>()

const { joinChannel, channelKeyError } = useIrcChat()

const key = ref('')

watch(() => props.channel, (val) => {
  if (val) {
    key.value = ''
    channelKeyError.value = false
  }
})

watch(key, () => {
  channelKeyError.value = false
})

function submit() {
  if (!props.channel || !key.value.trim())
    return
  joinChannel(props.channel, key.value.trim())
  // Modal stays open - closes automatically on successful JOIN,
  // or shows an error if 475 comes back.
}

function cancel() {
  channelKeyError.value = false
  emit('close')
}
</script>

<template>
  <Modal :open="channel !== null" size="s" @close="cancel">
    <template #header>
      <h4>Password required</h4>
    </template>

    <Flex column gap="m">
      <p class="channel-password-modal__desc">
        <strong>{{ channel }}</strong> is password protected. Enter the channel key to join.
      </p>
      <Input
        v-model="key"
        expand
        placeholder="Channel key"
        type="password"
        :errors="channelKeyError ? ['Incorrect key - try again.'] : undefined"
        @keydown.enter="submit"
      />
    </Flex>

    <template #footer>
      <Flex gap="s" x-between expand>
        <Button variant="gray" @click="cancel">
          Cancel
        </Button>
        <Button variant="accent" :disabled="!key.trim()" @click="submit">
          Join
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style lang="scss" scoped>
.channel-password-modal {
  &__desc {
    margin: 0;
    font-size: var(--font-size-s);
    color: var(--color-text-light);
  }
}
</style>
