<script setup lang="ts">
import { Button, Card, Drawer, Flex, Modal, Switch } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import { useExternalLinkGuard } from '@/composables/useExternalLinkGuard'
import { useBreakpoint } from '@/lib/mediaQuery'

const { open, pendingUrl, confirm, cancel } = useExternalLinkGuard()
const isMobile = useBreakpoint('<xs')

const dontAskAgain = ref(false)

// Reset the toggle whenever the modal is dismissed/closed so it never carries
// over to the next prompt.
watch(open, (isOpen) => {
  if (!isOpen)
    dontAskAgain.value = false
})

const displayHost = computed(() => {
  if (!pendingUrl.value)
    return ''
  try {
    return new URL(pendingUrl.value).hostname
  }
  catch {
    return pendingUrl.value
  }
})
</script>

<template>
  <!-- Mobile: bottom drawer -->
  <Drawer v-if="isMobile" :open="open" @close="cancel">
    <Flex column gap="m">
      <Flex column gap="s">
        <h4>Leaving Hivecom</h4>
        <p>This link will take you to an external site. Only continue if you trust it.</p>
      </Flex>

      <Card>
        <Flex gap="s">
          <Icon name="ph:arrow-square-out" class="text-color-lighter" />
          <Flex column :gap="0" class="external-link-modal__url">
            <strong class="external-link-modal__host">{{ displayHost }}</strong>
            <span class="text-xs text-color-lighter external-link-modal__full">{{ pendingUrl }}</span>
          </Flex>
        </Flex>
      </Card>

      <Flex column gap="l" expand>
        <Switch v-model="dontAskAgain" class="reversed" label="Don't ask me again" />
        <Flex gap="xs" expand>
          <Button expand @click="cancel">
            Cancel
          </Button>
          <Button expand variant="fill" @click="confirm(dontAskAgain)">
            Continue
          </Button>
        </Flex>
      </Flex>
    </Flex>
  </Drawer>

  <!-- Desktop: modal -->
  <Modal
    v-else
    :open="open"
    centered
    :card="{ footerSeparator: true }"
    :can-dismiss="false"
    size="s"
    @close="cancel"
  >
    <template #header>
      <Flex column gap="s">
        <h4>Leaving Hivecom</h4>
      </Flex>
    </template>
    <Flex column>
      <p class="text-s">
        This link will take you to an external site. Only continue if you trust it.
      </p>

      <Card>
        <Flex gap="s">
          <Icon name="ph:arrow-square-out" class="text-color-lighter" />
          <Flex column :gap="0" class="external-link-modal__url">
            <strong class="external-link-modal__host">{{ displayHost }}</strong>
            <span class="text-xs text-color-lighter external-link-modal__full">{{ pendingUrl }}</span>
          </Flex>
        </Flex>
      </Card>
    </Flex>

    <template #footer>
      <Flex expand y-center x-between gap="m" wrap>
        <Switch v-model="dontAskAgain" class="reversed" label="Don't ask me again" />
        <Flex gap="xs" x-end expand>
          <Button expand @click="cancel">
            Cancel
          </Button>
          <Button expand variant="fill" @click="confirm(dontAskAgain)">
            Continue
          </Button>
        </Flex>
      </Flex>
    </template>
  </Modal>
</template>

<style scoped lang="scss">
@use '@/assets/mixins.scss' as *;

// Constrain the host/URL lines inside the flex row so long links wrap
// instead of overflowing.
.external-link-modal__url {
  min-width: 0;
}

// Host fits on a single line (full URL is shown below).
.external-link-modal__host {
  @include truncate;
}

// Show the full URL, wrapping long links so the user can vet them.
.external-link-modal__full {
  overflow-wrap: anywhere;
  word-break: break-word;
}
</style>
