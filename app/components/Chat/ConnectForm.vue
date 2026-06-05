<script setup lang="ts">
import { Button, Divider, Flex, Input } from '@dolanske/vui'
import { useDataUser } from '@/composables/useDataUser'
import { useIrcChat } from '@/composables/useIrcChat'

const { connState, inputNick, inputChannel, connect, connectAsAnon, defaultChannel } = useIrcChat()

// Show a resolved channel in the hint even before the user has a persisted
// channel - falls back to the auth default so the hint is never blank.
const hintChannel = computed(() => inputChannel.value || defaultChannel(false))

const userId = useUserId()
const { user } = useDataUser(userId)

const connecting = computed(() => connState.value === 'connecting')

// Anon mode is shown when a signed-in user explicitly chooses to skip auth.
const anonMode = ref(false)
const anonNick = ref('')

function enterAnonMode() {
  anonNick.value = `anon-${Math.random().toString(36).slice(2, 7)}`
  inputChannel.value = defaultChannel(true)
  anonMode.value = true
}

function onAnonConnect() {
  if (!anonNick.value.trim() || !inputChannel.value.trim())
    return
  // Override the shared nick so openSocket uses the anon nick, not the
  // signed-in username that ensureNick may have seeded.
  inputNick.value = anonNick.value.trim()
  connectAsAnon()
}

// For the signed-out form - channel input stays shared.
function onSignedOutConnect() {
  if (inputNick.value.trim() && inputChannel.value.trim())
    connectAsAnon()
}
</script>

<template>
  <Flex column expand>
    <!--
      Client-only: branch selection here depends entirely on client state
      (`user` seeded from the client-side profile cache, `inputNick`/`inputChannel`
      from localStorage). During SSR none of that exists, so the server renders
      the signed-out branch - whose Connect button is `:disabled` because the
      inputs are empty server-side. On a warm-cache reload the client's first
      render is the auth branch instead, and that hydration mismatch strands the
      server's `disabled` attribute on the rendered button. Skipping SSR for the
      form removes the divergence entirely.
    -->
    <ClientOnly>
      <Transition name="connect-state" mode="out-in">
        <!-- Signed in, normal auth path -->
        <Flex v-if="user && !anonMode" key="auth" column gap="m" expand>
          <Flex column gap="xs">
            <h4 class="chat-connect__title">
              Connect to chat
            </h4>
            <p class="text-s text-color-light">
              You'll join <strong class="text-s">{{ hintChannel }}</strong> as <strong class="text-s">{{ user.username }}</strong> using your Hivecom account.
            </p>
          </Flex>
          <Flex y-center gap="s" wrap>
            <Button variant="accent" :loading="connecting" @click="connect()">
              <template #icon>
                <Icon name="ph:plugs-connected" />
              </template>
              Connect as {{ user.username }}
            </Button>
            <Button variant="gray" plain :disabled="connecting" @click="enterAnonMode">
              Continue as anon
            </Button>
          </Flex>
        </Flex>

        <!-- Signed in, anon path: pick a nick -->
        <Flex v-else-if="user && anonMode" key="anon" column gap="m" expand>
          <Flex column gap="xs">
            <h4 class="chat-connect__title">
              Connect as anon
            </h4>
            <p class="text-s text-color-light">
              Choose a nickname - you won't be verified.
            </p>
          </Flex>
          <Flex gap="s" wrap expand>
            <Flex column gap="xs" class="chat-connect__field">
              <label class="text-s text-color-light">Nickname</label>
              <Input
                v-model="anonNick"
                expand
                placeholder="anon-xxxxx"
                @keydown.enter="onAnonConnect"
              />
            </Flex>
            <Flex column gap="xs" class="chat-connect__field">
              <label class="text-s text-color-light">Channel</label>
              <Input v-model="inputChannel" expand placeholder="#public" @keydown.enter="onAnonConnect" />
            </Flex>
          </Flex>
          <Flex y-center gap="s" wrap>
            <Button
              variant="accent"
              :loading="connecting"
              :disabled="!anonNick.trim() || !inputChannel.trim()"
              @click="onAnonConnect"
            >
              Connect
            </Button>
            <Button variant="gray" plain :disabled="connecting" @click="anonMode = false">
              Back
            </Button>
          </Flex>
        </Flex>

        <!-- Signed out: classic nick + channel form -->
        <Flex v-else key="signedout" column gap="m" expand>
          <Flex gap="s" wrap expand>
            <Flex column gap="xs" class="chat-connect__field">
              <label class="text-s text-color-light">Nickname</label>
              <Input v-model="inputNick" expand placeholder="your-nick" @keydown.enter="onSignedOutConnect" />
            </Flex>
            <Flex column gap="xs" class="chat-connect__field">
              <label class="text-s text-color-light">Channel</label>
              <Input v-model="inputChannel" expand placeholder="#public" @keydown.enter="onSignedOutConnect" />
            </Flex>
          </Flex>
          <Flex y-center gap="s" wrap>
            <Button
              variant="accent"
              :loading="connecting"
              :disabled="!inputNick.trim() || !inputChannel.trim()"
              @click="onSignedOutConnect"
            >
              Connect
            </Button>
          </Flex>
          <Divider />
          <p class="text-s text-color-light">
            <NuxtLink to="/auth/sign-in">
              Sign in
            </NuxtLink> to a Hivecom account to chat with a verified identity.
          </p>
        </Flex>
      </Transition>
    </ClientOnly>
  </Flex>
</template>

<style lang="scss" scoped>
.connect-state-enter-active,
.connect-state-leave-active {
  transition: opacity var(--transition);
}

.connect-state-enter-from,
.connect-state-leave-to {
  opacity: 0;
}

.chat-connect {
  &__field {
    flex: 1;
    min-width: 140px;
  }

  &__title {
    margin: 0;
  }
}
</style>
