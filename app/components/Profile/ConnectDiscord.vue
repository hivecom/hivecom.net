<script setup lang="ts">
import { Button, pushToast, Toasts } from '@dolanske/vui'

import SharedErrorToast from '@/components/Shared/ErrorToast.vue'

const props = withDefaults(defineProps<{ redirectTo?: string }>(), {
  redirectTo: '/profile/settings',
})

const emit = defineEmits<{
  (e: 'linked'): void
}>()

const runtimeConfig = useRuntimeConfig()
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

async function startDiscordOAuth() {
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

  let didRedirect = false

  if (import.meta.client) {
    window.location.assign(data?.url ?? redirectTo)
    didRedirect = true
  }

  return didRedirect
}

type DiscordLinkAttempt = 'linked' | 'needs-oauth'

async function tryDirectDiscordLink(): Promise<DiscordLinkAttempt> {
  const { data, error } = await supabase.functions.invoke('link-discord')

  if (error)
    throw error

  if (data?.success) {
    pushToast('Discord connected successfully.')
    emit('linked')
    return 'linked'
  }

  if (data?.error === 'Discord identity not linked')
    return 'needs-oauth'

  throw new Error(data?.error ?? 'Failed to link Discord account.')
}

async function connectDiscord() {
  if (isLinking.value)
    return

  isLinking.value = true
  let redirected = false

  try {
    const result = await tryDirectDiscordLink()

    if (result === 'linked')
      return

    redirected = await startDiscordOAuth()
  }
  catch (err) {
    console.error('Error initiating Discord connection:', err)
    showErrorToast(err instanceof Error ? err.message : 'Unable to begin Discord connection.')
  }
  finally {
    if (!redirected)
      isLinking.value = false
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
