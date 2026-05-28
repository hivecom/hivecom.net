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
    bodyProps: { error: message },
  })
}

async function startLastfmLink() {
  if (isLinking.value)
    return

  isLinking.value = true

  try {
    const baseRedirect = props.redirectTo.startsWith('/') ? props.redirectTo : '/profile/settings'
    const redirect = `${baseRedirect}${baseRedirect.includes('?') ? '&' : '?'}connected=lastfm`
    const baseUrl = window.location.origin

    const { data, error } = await supabase.functions.invoke('lastfm-verify-request', {
      body: { redirect, baseUrl },
    })

    if (error)
      throw error

    if (!data?.url)
      throw new Error('No Last.fm URL returned')

    window.location.href = data.url as string
  }
  catch (error) {
    console.error('Last.fm link error:', error)
    showErrorToast(error instanceof Error ? error.message : 'Unable to start Last.fm authentication.')
    isLinking.value = false
  }
}
</script>

<template>
  <Button
    variant="fill"
    :expand="props.expand"
    :loading="isLinking"
    aria-label="Connect Last.fm account"
    size="s"
    @click="startLastfmLink"
  >
    Connect
  </Button>
</template>
