<script setup lang="ts">
import { Button, pushToast, Toasts } from '@dolanske/vui'

import SharedErrorToast from '@/components/Shared/ErrorToast.vue'

const props = withDefaults(defineProps<{ redirectTo?: string }>(), {
  redirectTo: '/profile/settings',
})

const runtimeConfig = useRuntimeConfig()
const supabase = useSupabaseClient()

const isLinking = ref(false)

function getRedirectUri() {
  const target = props.redirectTo.startsWith('/') ? props.redirectTo : '/profile/settings'
  const query = new URLSearchParams({ redirect: target })

  if (process.env.NODE_ENV === 'development')
    return `http://localhost:3000/auth/callback/discord?${query.toString()}`

  if (import.meta.client && window?.location?.origin)
    return `${window.location.origin}/auth/callback/discord?${query.toString()}`

  const baseUrl = runtimeConfig.public.baseUrl || 'https://hivecom.net'
  return `${baseUrl}/auth/callback/discord?${query.toString()}`
}

async function connectDiscord() {
  if (isLinking.value)
    return

  isLinking.value = true

  try {
    const redirectTo = getRedirectUri()
    const { data, error } = await supabase.auth.linkIdentity({
      provider: 'discord',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    })

    if (error)
      throw error

    if (import.meta.client) {
      window.location.assign(data?.url ?? redirectTo)
    }
  }
  catch (err) {
    console.error('Error initiating Discord connection:', err)
    isLinking.value = false

    pushToast('', {
      body: SharedErrorToast,
      bodyProps: {
        error: err instanceof Error ? err.message : 'Unable to begin Discord connection.',
      },
    })
  }
}
</script>

<template>
  <div>
    <Button
      variant="fill"
      :loading="isLinking"
      :disabled="isLinking"
      @click="connectDiscord"
    >
      <template #start>
        <Icon name="ph:discord-logo" />
      </template>
      Connect Discord
    </Button>
    <Toasts />
  </div>
</template>

<style scoped lang="scss">
</style>
