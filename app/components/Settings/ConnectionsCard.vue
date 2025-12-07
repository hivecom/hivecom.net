<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Button, Card, Checkbox, Flex, pushToast } from '@dolanske/vui'
import { reactive, ref, watch } from 'vue'
import SharedErrorToast from '@/components/Shared/ErrorToast.vue'

const props = defineProps<{ profile: Tables<'profiles'> | null }>()
const emit = defineEmits<{ (e: 'updated'): void }>()

const supabase = useSupabaseClient()

const disconnectLoading = reactive({
  patreon: false,
  discord: false,
})

const ConnectPatreonButton = defineAsyncComponent(() => import('@/components/Settings/ConnectPatreon.vue'))
const ConnectDiscord = defineAsyncComponent(() => import('@/components/Settings/ConnectDiscord.vue'))
const ConnectSteam = defineAsyncComponent(() => import('@/components/Settings/ConnectSteam.vue'))
const ConnectTeamspeak = defineAsyncComponent(() => import('@/components/Settings/ConnectTeamSpeak.vue'))

const richPresenceEnabled = ref(!(props.profile?.rich_presence_disabled ?? false))
const richPresenceLoading = ref(false)

watch(
  () => props.profile?.rich_presence_disabled,
  (disabled) => {
    richPresenceEnabled.value = !(disabled ?? false)
  },
)

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

async function updateRichPresence(enabled: boolean) {
  if (richPresenceLoading.value)
    return

  const previousValue = richPresenceEnabled.value
  richPresenceEnabled.value = enabled
  richPresenceLoading.value = true

  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error)
      throw error
    if (!user)
      throw new Error('You must be signed in to update rich presence.')

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ rich_presence_disabled: !enabled })
      .eq('id', user.id)

    if (updateError)
      throw updateError

    emit('updated')
  }
  catch (error) {
    richPresenceEnabled.value = previousValue
    const message = error instanceof Error ? error.message : 'Unable to update rich presence preference.'
    showErrorToast(message)
  }
  finally {
    richPresenceLoading.value = false
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

      <!-- TeamSpeak -->
      <Flex expand class="account-connection-row">
        <Flex x-between y-center expand>
          <Flex gap="m" y-center class="teamspeak-copy">
            <div class="account-icon teamspeak">
              <Icon name="mdi:teamspeak" size="20" />
            </div>
            <div>
              <strong>TeamSpeak</strong>
              <p class="text-xs text-color-lighter">
                Link your TeamSpeak identities to receive server access and roles
              </p>
            </div>
          </Flex>

          <div class="account-status teamspeak-actions">
            <ClientOnly>
              <ConnectTeamspeak :profile="props.profile" @linked="emit('updated')" />
            </ClientOnly>
          </div>
        </Flex>
      </Flex>

      <!-- Rich presence toggle -->
      <Flex expand class="account-connection-row">
        <Flex x-between y-center expand>
          <Flex gap="m" y-center>
            <div class="account-icon presence">
              <Icon name="ph:activity" size="20" />
            </div>
            <div>
              <strong>Rich presence</strong>
              <p class="text-xs text-color-lighter">
                Allow fetching and displaying information from any connected services
              </p>
            </div>
          </Flex>

          <div class="account-status presence-toggle">
            <Checkbox
              :model-value="richPresenceEnabled"
              :disabled="richPresenceLoading"
              @update:model-value="updateRichPresence"
            />
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

  .iconify {
    color: white;
  }
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

.account-icon.teamspeak {
  background: linear-gradient(135deg, #13202b 0%, #2a475e 100%);
}

.account-icon.presence {
  .iconify {
    color: var(--color-text-invert);
  }
  background: var(--color-accent);
}

.account-status {
  flex-shrink: 0;
}

.teamspeak-identities ul {
  list-style: none;
  margin: var(--space-xs) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.teamspeak-identities code {
  font-size: 0.7rem;
  background: var(--color-bg-raised);
  padding: 0.1rem 0.35rem;
  border-radius: var(--border-radius-s);
  word-break: break-all;
}

.teamspeak-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-xs);
}

.teamspeak-manage {
  width: max-content;
}

.presence-toggle label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  cursor: pointer;
}
</style>
