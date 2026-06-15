<script setup lang="ts">
import { Button, Flex, Modal } from '@dolanske/vui'
import { computed, ref } from 'vue'
import { usePwa } from '@/composables/usePwa'

// Forward layout/style attrs (expand, size, variant, ...) straight to the Button.
// The template has multiple roots, so attrs don't fall through automatically.
defineOptions({ inheritAttrs: false })

// Offer to install the PWA. Chromium exposes a native prompt; iOS Safari has no
// programmatic install, so we fall back to "Add to Home Screen" instructions.
const { isStandalone, canInstall, isIOS, install } = usePwa()

const installing = ref(false)
const showIosHelp = ref(false)

// Hidden once installed, or when there's no install path on this device.
const show = computed(() => !isStandalone.value && (canInstall.value || isIOS.value))

async function handleClick() {
  if (canInstall.value) {
    installing.value = true
    try {
      await install()
    }
    finally {
      installing.value = false
    }
    return
  }
  // iOS: no programmatic prompt, walk the user through it.
  showIosHelp.value = true
}
</script>

<template>
  <template v-if="show">
    <Button variant="accent" v-bind="$attrs" :loading="installing" @click="handleClick">
      <template #start>
        <Icon name="ph:device-mobile" />
      </template>
      Install app
    </Button>

    <Modal :open="showIosHelp" size="s" centered @close="showIosHelp = false">
      <template #header>
        <h4 style="margin: 0">
          Install Hivecom
        </h4>
      </template>

      <Flex column gap="m">
        <p class="text-color-light" style="margin: 0">
          Add Hivecom to your home screen to get an app icon and push notifications.
        </p>
        <Flex y-center gap="s">
          <Icon name="ph:share-network" size="20" />
          <span>Tap the Share button in your browser toolbar.</span>
        </Flex>
        <Flex y-center gap="s">
          <Icon name="ph:plus-square" size="20" />
          <span>Choose "Add to Home Screen".</span>
        </Flex>
        <Flex y-center gap="s">
          <Icon name="ph:check-circle" size="20" />
          <span>Open Hivecom from your home screen.</span>
        </Flex>
      </Flex>

      <template #footer>
        <Flex expand x-end>
          <Button expand variant="accent" @click="showIosHelp = false">
            Got it
          </Button>
        </Flex>
      </template>
    </Modal>
  </template>
</template>
