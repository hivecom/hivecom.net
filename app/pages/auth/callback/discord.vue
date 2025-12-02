<script setup lang="ts">
import { Button } from '@dolanske/vui'
import Loading from '@/components/Layout/Loading.vue'

const supabase = useSupabaseClient()
const route = useRoute()

const status = ref<'loading' | 'success' | 'error'>('loading')
const errorMessage = ref('')

const redirectTarget = computed(() => {
  const redirectParam = route.query.redirect
  if (typeof redirectParam === 'string' && redirectParam.startsWith('/'))
    return redirectParam
  return '/profile/settings'
})

async function finishLinking() {
  if (typeof window === 'undefined')
    return

  try {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(window.location.href)
    if (exchangeError)
      throw exchangeError

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError)
      throw userError
    if (!user)
      throw new Error('No active session found after Discord sign-in.')

    const discordIdentity = user.identities?.find(identity => identity.provider === 'discord')
    if (!discordIdentity)
      throw new Error('Discord identity not found in session.')

    const identityData = discordIdentity.identity_data as Record<string, unknown> | null
    const getField = (key: string) => {
      const value = identityData?.[key]
      return typeof value === 'string' ? value : undefined
    }

    const discordId = getField('id')
      || getField('user_id')
      || getField('sub')
      || getField('provider_id')

    if (!discordId)
      throw new Error('Unable to determine Discord user ID.')

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ discord_id: discordId })
      .eq('id', user.id)

    if (updateError) {
      if (updateError.code === '23505') {
        throw new Error('That Discord account is already linked to another profile.')
      }
      throw updateError
    }

    status.value = 'success'

    setTimeout(() => {
      navigateTo(redirectTarget.value)
    }, 1500)
  }
  catch (err) {
    console.error('Discord link callback error:', err)
    status.value = 'error'
    errorMessage.value = err instanceof Error ? err.message : 'Failed to connect Discord account.'
  }
}

onMounted(() => {
  finishLinking()
})
</script>

<template>
  <div class="discord-callback">
    <div v-if="status === 'loading'" class="callback-container">
      <Loading />
      <h2>Connecting your Discord account</h2>
      <p>Please wait while we link your profile...</p>
    </div>

    <div v-else-if="status === 'success'" class="callback-container success">
      <Icon name="mdi:check-circle" size="48" />
      <h2>Discord connected!</h2>
      <p>Your Discord account has been linked successfully.</p>
      <p>Redirecting you back...</p>
    </div>

    <div v-else class="callback-container error">
      <Icon name="mdi:alert-circle" size="48" />
      <h2>Connection failed</h2>
      <p>{{ errorMessage }}</p>
      <Button variant="fill" @click="navigateTo('/profile/settings')">
        Return to Settings
      </Button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.discord-callback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 50vh;
  padding: 2rem;
}

.callback-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 500px;
}

.callback-container h2 {
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}

.callback-container p {
  margin-bottom: 1rem;
  color: var(--color-text);
}

.success {
  color: var(--color-text-green);
}

.error {
  color: var(--color-text-red);
}
</style>
