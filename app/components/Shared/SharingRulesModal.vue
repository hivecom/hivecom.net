<script setup lang="ts">
import type { Database } from '@/types/database.types'
import { Button, Flex, Modal } from '@dolanske/vui'
import { ref } from 'vue'
import { useSupabaseClient } from '#imports'
import { useDepot } from '@/composables/useDepot'
import { useSharingRulesAgreement } from '@/composables/useSharingRulesAgreement'
import { useUserId } from '@/composables/useUserId'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  title?: string
  description?: string
  confirmText?: string
  confirmLoading?: boolean
  cancelText?: string
  // When false, the modal is view-only (no agree/cancel footer). Defaults to
  // showing the agree footer.
  showAgreeButton?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const supabase = useSupabaseClient<Database>()
const userId = useUserId()
const { markAgreed } = useSharingRulesAgreement()
const { baseUrl: depotUrl, host } = useDepot()
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
    .update({ agreed_sharing_rules: true })
    .eq('id', userId.value)

  isSaving.value = false

  if (error)
    return

  markAgreed()
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
        <h4>{{ props.title || 'Sharing Rules' }}</h4>
      </Flex>
    </template>

    <Flex column gap="s">
      <p v-if="props.showAgreeButton" class="text-l text-bold">
        {{ props.description || 'Please review and agree to the sharing rules before uploading:' }}
      </p>
      <p>
        Uploads go to our <a :href="depotUrl" target="_blank" rel="noopener">Orbit Depot ({{ host }})</a>, our public storage gateway. By uploading you accept that:
      </p>
      <ul class="rules-list">
        <li><b>Your uploads are public.</b> Links are unguessable but unauthenticated, so anyone with the link can view a file. Treat nothing you upload here as private.</li>
        <li><b>No abusive hotlinking.</b> You can absolutely share things on other sites but use a real file host if you're expecting thousands/millions of requests. Exhaustively hotlinked content will be removed.</li>
        <li><b>Nothing illegal.</b> Uploading illegal content will get you banned. This is not negotiable.</li>
        <li>Administrators and moderators reserve the right to remove any upload at their own discretion, without notice.</li>
        <li>The content rules apply here too. <b>Use common sense.</b></li>
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
          {{ props.confirmText || 'Agree' }}
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
