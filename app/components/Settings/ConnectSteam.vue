<script setup lang="ts">
import { Button, pushToast } from '@dolanske/vui'
import SharedErrorToast from '@/components/Shared/ErrorToast.vue'

const props = withDefaults(defineProps<{
  expand?: boolean
  redirectTo?: string
}>(), {
  expand: false,
  redirectTo: '/profile/settings',
})

defineEmits<{
  (e: 'linked'): void
}>()

const supabase = useSupabaseClient()
const isLinking = ref(false)

function showErrorToast(message: string) {
  pushToast('', {
    body: SharedErrorToast,
    bodyProps: {
      error: message,
    },
  })
}

async function startSteamLink() {
  if (isLinking.value)
    return

  isLinking.value = true

  try {
    const redirect = props.redirectTo.startsWith('/') ? props.redirectTo : '/profile/settings'
    const baseUrl = window.location.origin

    const { data, error } = await supabase.functions.invoke('openid-steam-start', {
      body: {
        mode: 'link',
        redirect,
        baseUrl,
      },
    })

    if (error)
      throw error

    if (!data?.url)
      throw new Error('No Steam URL returned')

    window.location.href = data.url
  }
  catch (error) {
    console.error('Steam link error:', error)
    showErrorToast(error instanceof Error ? error.message : 'Unable to start Steam authentication.')
    isLinking.value = false
  }
}
</script>

<template>
  <Button
    variant="fill"
    :expand="props.expand"
    :loading="isLinking"
    aria-label="Connect Steam account"
    @click="startSteamLink"
  >
    <template #start>
      <Icon name="ph:steam-logo" />
    </template>
    Connect Steam
  </Button>
</template>

<style scoped lang="scss">
</style>
