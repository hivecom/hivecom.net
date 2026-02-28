<script setup lang="ts">
import type { Database } from '@/types/database.types'
import { useSupabaseClient } from '#imports'
import { Button, Flex, Modal } from '@dolanske/vui'
import { ref } from 'vue'
import { useUserId } from '@/composables/useUserId'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  title?: string
  description?: string
  confirmText?: string
  confirmLoading?: boolean
  cancelText?: string
  showAgreeButton?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const supabase = useSupabaseClient<Database>()
const userId = useUserId()
const isSaving = ref(false)

const open = defineModel<boolean>('open', { default: false })
const isBelowSmall = useBreakpoint('<xs')

async function handleConfirm(close: () => void) {
  if (!userId.value) {
    emit('confirm')
    close()
    return
  }

  isSaving.value = true

  const { error } = await supabase
    .from('profiles')
    .update({ agreed_content_rules: true })
    .eq('id', userId.value)

  isSaving.value = false

  if (error)
    return

  emit('confirm')
  close()
}
</script>

<template>
  <Modal
    :open="open"
    centered
    :card="{ footerSeparator: true }"
    :can-dismiss="true"
    :size="isBelowSmall ? 'screen' : 'm'"
    @close="open = false"
  >
    <template #header>
      <Flex column gap="s">
        <h4>{{ props.title || 'Content Rules' }}</h4>
      </Flex>
    </template>

    <Flex column gap="s">
      <p v-if="props.showAgreeButton" class="text-l">
        {{ props.description || 'Please review and agree to the content rules before continuing.' }}
      </p>
      <p>
        These rules are guidelines, not law, and are interpreted by the staff:
      </p>
      <ul class="rules-list">
        <li>Although this is the internet, we are not your goon chamber. Don't post sexually explicit content or nudity.</li>
        <li>Content containing gore, intense violence, or anything adult related should be put behind a spoiler tag.</li>
        <li>Don't be a jerk or harass others. Banter is fine, but read the room.</li>
        <li><b>Use common sense.</b></li>
      </ul>
    </Flex>

    <template v-if="props.showAgreeButton !== false" #footer="{ close }">
      <Flex gap="xs" expand x-end>
        <Button :expand="isBelowSmall" @click="close(); emit('cancel')">
          {{ props.cancelText || 'Cancel' }}
        </Button>
        <Button
          :expand="isBelowSmall"
          :loading="props.confirmLoading || isSaving"
          variant="accent"
          @click="() => handleConfirm(close)"
        >
          {{ props.confirmText || 'Acknowledge' }}
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style scoped>
.rules-list {
  list-style: disc;
  display: grid;
  gap: var(--space-xs);
  padding-left: var(--space-m);
  margin: 0;
  color: var(--color-text);
}

.rules-list li::marker {
  color: var(--color-text-light);
}
</style>
