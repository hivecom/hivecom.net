<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Button, Card, Flex, pushToast } from '@dolanske/vui'
import SharedErrorToast from '@/components/Shared/ErrorToast.vue'

const props = defineProps<{ profile: Tables<'profiles'> | null }>()
const emit = defineEmits<{ (e: 'updated'): void }>()

const supabase = useSupabaseClient()

const disconnectLoading = reactive({
  patreon: false,
  discord: false,
})

const ConnectPatreonButton = defineAsyncComponent(() => import('@/components/Profile/ConnectPatreon.vue'))
const ConnectDiscord = defineAsyncComponent(() => import('@/components/Profile/ConnectDiscord.vue'))
const ConnectSteam = defineAsyncComponent(() => import('@/components/Profile/ConnectSteam.vue'))

function showErrorToast(message: string) {
  pushToast('', {
    body: SharedErrorToast,
    bodyProps: {
      error: message,
    },
  })
}

async function disconnectPatreon() {
  if (disconnectLoading.patreon)
    return

  disconnectLoading.patreon = true
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error)
      throw error
    if (!user)
      throw new Error('You must be signed in to disconnect Patreon.')

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        patreon_id: null,
        supporter_patreon: false,
      })
      .eq('id', user.id)

    if (updateError)
      throw updateError

    pushToast('Patreon disconnected successfully.')
    emit('updated')
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to disconnect Patreon.'
    showErrorToast(message)
  }
  finally {
    disconnectLoading.patreon = false
  }
}

async function disconnectDiscord() {
  if (disconnectLoading.discord)
    return

  disconnectLoading.discord = true
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error)
      throw error
    if (!user)
      throw new Error('You must be signed in to disconnect Discord.')

    const discordIdentity = user.identities?.find(identity => identity.provider === 'discord')
    if (discordIdentity) {
      const identityId = ('identity_id' in discordIdentity && discordIdentity.identity_id)
        || discordIdentity.id

      if (!identityId)
        throw new Error('Unable to resolve Discord identity.')

      const { error: unlinkError } = await supabase.auth.unlinkIdentity(discordIdentity)
      if (unlinkError)
        throw unlinkError
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ discord_id: null })
      .eq('id', user.id)

    if (updateError)
      throw updateError

    pushToast('Discord disconnected successfully.')
    emit('updated')
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to disconnect Discord.'
    showErrorToast(message)
  }
  finally {
    disconnectLoading.discord = false
  }
}
</script>

<template>
  <Card separators class="connected-card w-100">
    <template #header>
      <Flex x-between y-center>
        <h3>Connections</h3>
        <Icon name="ph:link" />
      </Flex>
    </template>

    <Flex column gap="m">
      <!-- Patreon -->
      <Flex expand class="account-connection-row">
        <Flex x-between y-center expand>
          <Flex gap="m" y-center>
            <div class="account-icon patreon">
              <Icon name="ph:patreon-logo" size="20" />
            </div>
            <div>
              <strong>Patreon</strong>
              <p class="text-xs text-color-lighter">
                Connect to get your supporter benefits
              </p>
            </div>
          </Flex>

          <div class="account-status">
            <Flex v-if="props.profile?.patreon_id" gap="s" y-center>
              <Badge variant="success" size="s">
                <Icon name="ph:check" />
                Connected
              </Badge>
              <Button variant="danger" :loading="disconnectLoading.patreon" @click="disconnectPatreon">
                Disconnect
              </Button>
            </Flex>
            <ClientOnly v-else>
              <ConnectPatreonButton @linked="emit('updated')" />
            </ClientOnly>
          </div>
        </Flex>
      </Flex>

      <!-- Steam -->
      <Flex expand class="account-connection-row">
        <Flex x-between y-center expand>
          <Flex gap="m" y-center>
            <div class="account-icon steam">
              <Icon name="ph:game-controller" size="20" />
            </div>
            <div>
              <strong>Steam</strong>
              <p class="text-xs text-color-lighter">
                Connect your gaming profile
              </p>
            </div>
          </Flex>

          <div class="account-status">
            <Badge v-if="props.profile?.steam_id" variant="success" size="s">
              <Icon name="ph:check" />
              Connected
            </Badge>
            <ClientOnly v-else>
              <ConnectSteam @linked="emit('updated')" />
            </ClientOnly>
          </div>
        </Flex>
      </Flex>

      <!-- Discord -->
      <Flex expand class="account-connection-row">
        <Flex x-between y-center expand>
          <Flex gap="m" y-center>
            <div class="account-icon discord">
              <Icon name="ph:discord-logo" size="20" />
            </div>
            <div>
              <strong>Discord</strong>
              <p class="text-xs text-color-lighter">
                Sign-in through Discord
              </p>
            </div>
          </Flex>

          <div class="account-status">
            <Flex v-if="props.profile?.discord_id" gap="s" y-center>
              <Badge variant="success" size="s">
                <Icon name="ph:check" />
                Connected
              </Badge>
              <Button variant="danger" :loading="disconnectLoading.discord" @click="disconnectDiscord">
                Disconnect
              </Button>
            </Flex>
            <ClientOnly v-else>
              <ConnectDiscord @linked="emit('updated')" />
            </ClientOnly>
          </div>
        </Flex>
      </Flex>
    </Flex>
  </Card>
</template>

<style scoped>
.account-connection-row {
  padding: var(--space-m);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  background: var(--color-bg-subtle);
}

.account-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--border-radius-m);
  flex-shrink: 0;
  color: white;
}

.account-icon.patreon {
  background: linear-gradient(135deg, #ff424d 0%, #ff8a00 100%);
}

.account-icon.steam {
  background: linear-gradient(135deg, #171a21 0%, #2a475e 100%);
}

.account-icon.discord {
  background: linear-gradient(135deg, #5865f2 0%, #7289da 100%);
}

.account-status {
  flex-shrink: 0;
}
</style>
